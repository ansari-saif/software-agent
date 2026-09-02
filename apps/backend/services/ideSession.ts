import Docker from "dockerode";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getProjectPath, getWorkspaceRoot } from "../utils/fileWriter";

export type IdeKind = "backend" | "frontend";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const IDE_NETWORK = process.env.IDE_DOCKER_NETWORK || "software-agent_default";
const IDE_DOMAIN = process.env.IDE_BASE_DOMAIN || "ide.ansarisaif.com";
const MAX_CONCURRENT_IDE = Number(process.env.MAX_CONCURRENT_IDE || "3");
const IDE_MEMORY = process.env.IDE_MEMORY || "4g";
const IDE_CPUS = Number(process.env.IDE_CPUS || "1");
const IDE_IDLE_MINUTES = Number(process.env.IDE_IDLE_MINUTES || "30");
const IDE_PASSWORD = process.env.IDE_PASSWORD || "changeme";
const BACKEND_IMAGE =
  process.env.IDE_BACKEND_IMAGE || "software-agent-code-server-backend:latest";
const FRONTEND_IMAGE =
  process.env.IDE_FRONTEND_IMAGE || "software-agent-code-server-frontend:latest";

type SessionMeta = {
  sessionId: string;
  userId: string;
  kind: IdeKind;
  containerId: string;
  createdAt: number;
  lastSeenAt: number;
};

const sessions = new Map<string, SessionMeta>();

function sessionKey(userId: string, kind: IdeKind) {
  return `${userId}:${kind}`;
}

function sanitizeId(input: string): string {
  return input.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 48).toLowerCase() || "user";
}

export function getIdePublicUrl(sessionId: string, folder: string): string {
  return `https://${sessionId}.${IDE_DOMAIN}/?folder=${encodeURIComponent(folder)}`;
}

export function getIdePreviewUrl(sessionId: string, kind: IdeKind): string {
  if (kind === "backend") {
    return `https://${sessionId}.${IDE_DOMAIN}/proxy/8000/docs/`;
  }
  return `https://${sessionId}.${IDE_DOMAIN}/proxy/5173/`;
}

async function countRunningIdeContainers(): Promise<number> {
  const list = await docker.listContainers({
    filters: {
      label: ["com.software-agent.ide=true"],
      status: ["running"],
    },
  });
  return list.length;
}

async function ensureWorkspace(userId: string, kind: IdeKind): Promise<string> {
  const projectPath = getProjectPath(kind, userId);
  await fs.mkdir(projectPath, { recursive: true });
  return projectPath;
}

export async function createOrReuseIdeSession(
  userId: string,
  kind: IdeKind
): Promise<{
  sessionId: string;
  url: string;
  folder: string;
  previewUrl: string;
  docsUrl?: string;
  kind: IdeKind;
}> {
  if (kind !== "backend" && kind !== "frontend") {
    const err = new Error("kind must be backend or frontend");
    (err as any).status = 400;
    throw err;
  }

  const key = sessionKey(userId, kind);
  const existing = sessions.get(key);
  if (existing) {
    try {
      const container = docker.getContainer(existing.containerId);
      const info = await container.inspect();
      if (info.State.Running) {
        existing.lastSeenAt = Date.now();
        const folder = getProjectPath(kind, userId);
        return {
          sessionId: existing.sessionId,
          url: getIdePublicUrl(existing.sessionId, folder),
          folder,
          previewUrl: getIdePreviewUrl(existing.sessionId, kind),
          docsUrl:
            kind === "backend"
              ? getIdePreviewUrl(existing.sessionId, kind)
              : undefined,
          kind,
        };
      }
    } catch {
      sessions.delete(key);
    }
  }

  const running = await countRunningIdeContainers();
  if (running >= MAX_CONCURRENT_IDE) {
    const err = new Error(
      `IDE capacity reached (max ${MAX_CONCURRENT_IDE} concurrent sessions)`
    );
    (err as any).status = 503;
    throw err;
  }

  const folder = await ensureWorkspace(userId, kind);
  const sessionId = `${sanitizeId(userId)}-${kind}-${crypto
    .randomBytes(3)
    .toString("hex")}`;
  const image = kind === "frontend" ? FRONTEND_IMAGE : BACKEND_IMAGE;

  const hostWorkspaceRoot = process.env.HOST_WORKSPACE_ROOT || getWorkspaceRoot();
  const hostFolder = path.join(hostWorkspaceRoot, userId, kind);

  await fs.mkdir(folder, { recursive: true });

  const container = await docker.createContainer({
    Image: image,
    name: `ide-${sessionId}`,
    Env: [
      `PUID=1000`,
      `PGID=1000`,
      `PASSWORD=${IDE_PASSWORD}`,
      `DEFAULT_WORKSPACE=${folder}`,
      `TARGET_DIR=${folder}`,
      `TZ=Asia/Kolkata`,
    ],
    HostConfig: {
      Binds: [`${hostFolder}:${folder}`],
      Memory: parseMemory(IDE_MEMORY),
      NanoCpus: Math.floor(IDE_CPUS * 1e9),
      NetworkMode: IDE_NETWORK,
      RestartPolicy: { Name: "unless-stopped" },
    },
    Labels: {
      "com.software-agent.ide": "true",
      "com.software-agent.user": userId,
      "com.software-agent.kind": kind,
      "com.software-agent.session": sessionId,
      "traefik.enable": "true",
      [`traefik.http.routers.${sessionId}.rule`]: `Host(\`${sessionId}.${IDE_DOMAIN}\`)`,
      [`traefik.http.routers.${sessionId}.entrypoints`]: "web",
      [`traefik.http.services.${sessionId}.loadbalancer.server.port`]: "8443",
    },
  });

  await container.start();

  const meta: SessionMeta = {
    sessionId,
    userId,
    kind,
    containerId: container.id,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  };
  sessions.set(key, meta);

  return {
    sessionId,
    url: getIdePublicUrl(sessionId, folder),
    folder,
    previewUrl: getIdePreviewUrl(sessionId, kind),
    docsUrl:
      kind === "backend" ? getIdePreviewUrl(sessionId, kind) : undefined,
    kind,
  };
}

export async function stopIdeSession(
  userId: string,
  kind: IdeKind
): Promise<boolean> {
  const key = sessionKey(userId, kind);
  const existing = sessions.get(key);
  if (!existing) return false;
  try {
    const container = docker.getContainer(existing.containerId);
    await container.stop({ t: 10 }).catch(() => undefined);
    await container.remove({ force: true }).catch(() => undefined);
  } finally {
    sessions.delete(key);
  }
  return true;
}

function parseMemory(value: string): number {
  const match = /^(\d+(?:\.\d+)?)([gGmM])?$/.exec(value.trim());
  if (!match) return 4 * 1024 * 1024 * 1024;
  const n = Number(match[1]);
  const unit = (match[2] || "g").toLowerCase();
  return unit === "m" ? Math.floor(n * 1024 * 1024) : Math.floor(n * 1024 * 1024 * 1024);
}

export function startIdeIdleReaper() {
  const intervalMs = 60_000;
  setInterval(async () => {
    const cutoff = Date.now() - IDE_IDLE_MINUTES * 60_000;
    for (const [key, meta] of sessions.entries()) {
      if (meta.lastSeenAt >= cutoff) continue;
      try {
        const container = docker.getContainer(meta.containerId);
        await container.stop({ t: 10 }).catch(() => undefined);
        await container.remove({ force: true }).catch(() => undefined);
      } catch {
        // ignore
      }
      sessions.delete(key);
      console.log(`[ide] reaped idle session ${meta.sessionId}`);
    }
  }, intervalMs).unref();
}
