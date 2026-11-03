import { PassThrough } from "stream";
import Docker from "dockerode";
import type { Logger } from "pino";
import {
  constantTimeTokenEquals,
  generateRandomSessionToken,
  hashSessionToken,
} from "@repo/auth";
import { prismaClient } from "db";
import { resolveInsideSafe } from "./pathSafety";
import { WorkspaceFilesystem } from "./workspaceFs";

const LABEL_SANDBOX = "com.software-agent.sandbox";
const LABEL_PROJECT = "com.software-agent.project-id";
const LABEL_USER = "com.software-agent.user-id";
const CAPACITY_LOCK_ID = 842001;
const SESSION_COOKIE = "sbx_session";
const MAX_EXEC_OUTPUT_BYTES = 512 * 1024;

export interface SandboxConfig {
  workspaceRoot: string;
  hostWorkspaceRoot: string;
  image: string;
  network: string;
  baseDomain: string;
  protocol: "http" | "https";
  maxConcurrent: number;
  memoryBytes: number;
  nanoCpus: number;
  pidsLimit: number;
  idleMinutes: number;
  maxAgeMinutes: number;
  dockerProxyUrl?: string;
}

export function loadSandboxConfig(env = process.env): SandboxConfig {
  const workspaceRoot = env.WORKSPACE_ROOT || "/data/workspaces";
  return {
    workspaceRoot,
    hostWorkspaceRoot: env.HOST_WORKSPACE_ROOT || workspaceRoot,
    image: env.SANDBOX_IMAGE || "software-agent-sandbox:latest",
    network: env.SANDBOX_NETWORK || "software-agent_sandbox-net",
    baseDomain: env.SANDBOX_BASE_DOMAIN || "sandbox.localhost",
    protocol: env.SANDBOX_PROTOCOL === "http" ? "http" : "https",
    maxConcurrent: Number(env.MAX_CONCURRENT_SANDBOXES || 5),
    memoryBytes: Math.floor(Number(env.SANDBOX_MEMORY_GB || 2) * 1024 ** 3),
    nanoCpus: Math.floor(Number(env.SANDBOX_CPUS || 1) * 1e9),
    pidsLimit: Number(env.SANDBOX_PIDS_LIMIT || 256),
    idleMinutes: Number(env.SANDBOX_IDLE_MINUTES || 30),
    maxAgeMinutes: Number(env.SANDBOX_MAX_AGE_MINUTES || 240),
    dockerProxyUrl: env.DOCKER_PROXY_URL,
  };
}

function createDocker(proxyUrl?: string): Docker {
  if (!proxyUrl) {
    throw new Error(
      "DOCKER_PROXY_URL is required; the controller never mounts the Docker socket directly"
    );
  }
  const u = new URL(proxyUrl);
  return new Docker({
    protocol: u.protocol === "https:" ? "https" : "http",
    host: u.hostname,
    port: Number(u.port || 2375),
  });
}

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface SessionInfo {
  projectId: string;
  status: "RUNNING";
  ideUrl: string;
  previewUrl: string | null;
  previewPort: number | null;
  previewPath: string | null;
  expiresAt: string;
}

export class SandboxManager {
  readonly fs: WorkspaceFilesystem;
  private readonly docker: Docker;
  private reaper?: NodeJS.Timeout;
  /** Serializes lifecycle operations per project. Assumes a single controller instance. */
  private readonly projectLocks = new Map<string, Promise<unknown>>();

  constructor(
    readonly config: SandboxConfig,
    private readonly log: Logger,
    docker?: Docker
  ) {
    this.fs = new WorkspaceFilesystem(config.workspaceRoot);
    this.docker = docker ?? createDocker(config.dockerProxyUrl);
  }

  buildUrls(
    projectId: string,
    token: string | null,
    previewPort?: number | null,
    previewPath?: string | null
  ): { ideUrl: string; previewUrl: string | null } {
    const base = `${this.config.protocol}://${projectId}.${this.config.baseDomain}`;
    const withToken = (url: string) => {
      if (!token) return url;
      return `${url}${url.includes("?") ? "&" : "?"}tkn=${encodeURIComponent(token)}`;
    };
    const ideUrl = withToken(`${base}/?folder=/workspace`);
    if (!previewPort) return { ideUrl, previewUrl: null };
    const p = previewPath?.startsWith("/") ? previewPath : `/${previewPath ?? ""}`;
    return { ideUrl, previewUrl: withToken(`${base}/proxy/${previewPort}${p}`) };
  }

  /** Adopt labeled containers that match DB rows; remove orphans (ARC-02). */
  async reconcile(): Promise<void> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: [`${LABEL_SANDBOX}=true`] },
    });
    const rows = await prismaClient.sandbox.findMany();
    const byProject = new Map(rows.map((r) => [r.projectId, r]));
    const alive = new Set<string>();

    for (const c of containers) {
      const projectId = c.Labels?.[LABEL_PROJECT];
      const row = projectId ? byProject.get(projectId) : undefined;
      if (!projectId || !row || c.State !== "running") {
        await this.removeContainer(c.Id);
        continue;
      }
      alive.add(projectId);
      await prismaClient.sandbox.update({
        where: { id: row.id },
        data: { containerId: c.Id, status: "RUNNING" },
      });
    }
    for (const row of rows) {
      if (row.status !== "STOPPED" && !alive.has(row.projectId)) {
        await prismaClient.sandbox.update({
          where: { id: row.id },
          data: { status: "STOPPED", containerId: null },
        });
      }
    }
  }

  private async removeContainer(idOrName: string): Promise<void> {
    const c = this.docker.getContainer(idOrName);
    await c.stop({ t: 5 }).catch(() => undefined);
    await c.remove({ force: true }).catch(() => undefined);
  }

  private async runningContainerId(projectId: string): Promise<string | null> {
    const row = await prismaClient.sandbox.findUnique({ where: { projectId } });
    if (!row?.containerId || row.status !== "RUNNING") return null;
    try {
      const info = await this.docker.getContainer(row.containerId).inspect();
      return info.State.Running ? row.containerId : null;
    } catch {
      return null;
    }
  }

  /**
   * Ensure a running container exists. By default the session token is rotated and the
   * returned URLs carry it. With `rotateToken: false` an existing session stays valid
   * (so URLs already handed to the browser keep working) and the URLs carry no token.
   */
  async ensure(input: {
    projectId: string;
    userId: string;
    previewPort?: number | null;
    previewPath?: string | null;
    rotateToken?: boolean;
  }): Promise<SessionInfo & { containerId: string }> {
    return this.withProjectLock(input.projectId, () => this.ensureLocked(input));
  }

  private async withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.projectLocks.get(projectId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    const tail = run.catch(() => undefined);
    this.projectLocks.set(projectId, tail);
    try {
      return await run;
    } finally {
      if (this.projectLocks.get(projectId) === tail) this.projectLocks.delete(projectId);
    }
  }

  private async ensureLocked(input: {
    projectId: string;
    userId: string;
    previewPort?: number | null;
    previewPath?: string | null;
    rotateToken?: boolean;
  }): Promise<SessionInfo & { containerId: string }> {
    await this.fs.ensureWorkspace(input.userId, input.projectId);
    const rotate = input.rotateToken ?? true;
    const { rawToken, tokenHash } = generateRandomSessionToken();
    let containerId = await this.runningContainerId(input.projectId);

    if (containerId) {
      await prismaClient.sandbox.update({
        where: { projectId: input.projectId },
        data: rotate ? { sessionTokenHash: tokenHash, lastSeenAt: new Date() } : { lastSeenAt: new Date() },
      });
    } else {
      containerId = await this.create(input.projectId, input.userId, tokenHash);
    }

    return {
      projectId: input.projectId,
      containerId,
      status: "RUNNING",
      previewPort: input.previewPort ?? null,
      previewPath: input.previewPath ?? null,
      expiresAt: new Date(Date.now() + this.config.idleMinutes * 60_000).toISOString(),
      ...this.buildUrls(input.projectId, rotate ? rawToken : null, input.previewPort, input.previewPath),
    };
  }

  private async create(projectId: string, userId: string, tokenHash: string): Promise<string> {
    await prismaClient.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CAPACITY_LOCK_ID})`;
      const active = await tx.sandbox.count({
        where: { status: { in: ["RUNNING", "STARTING"] }, NOT: { projectId } },
      });
      if (active >= this.config.maxConcurrent) {
        throw new HttpError(
          503,
          "SANDBOX_CAPACITY",
          `Sandbox capacity reached (max ${this.config.maxConcurrent})`
        );
      }
      await tx.sandbox.upsert({
        where: { projectId },
        update: { userId, status: "STARTING", sessionTokenHash: tokenHash, lastSeenAt: new Date() },
        create: { projectId, userId, status: "STARTING", sessionTokenHash: tokenHash },
      });
    });

    const name = `sbx-${projectId}`;
    await this.removeContainer(name);
    const router = `sbx${projectId.replace(/[^a-z0-9]/gi, "")}`;

    try {
      const container = await this.docker.createContainer({
        Image: this.config.image,
        name,
        Env: ["PUID=1000", "PGID=1000", "DEFAULT_WORKSPACE=/workspace", "TZ=UTC"],
        Cmd: undefined,
        HostConfig: {
          Binds: [`${this.config.hostWorkspaceRoot}/${userId}/${projectId}:/workspace`],
          Memory: this.config.memoryBytes,
          NanoCpus: this.config.nanoCpus,
          PidsLimit: this.config.pidsLimit,
          NetworkMode: this.config.network,
          CapDrop: ["ALL"],
          CapAdd: ["CHOWN", "SETUID", "SETGID", "DAC_OVERRIDE", "FOWNER"],
          SecurityOpt: ["no-new-privileges:true"],
          Tmpfs: { "/tmp": "rw,nosuid,size=512m" },
          RestartPolicy: { Name: "no" },
        },
        Labels: {
          [LABEL_SANDBOX]: "true",
          [LABEL_PROJECT]: projectId,
          [LABEL_USER]: userId,
          "traefik.enable": "true",
          "traefik.docker.network": this.config.network,
          [`traefik.http.routers.${router}.rule`]: `Host(\`${projectId}.${this.config.baseDomain}\`)`,
          [`traefik.http.routers.${router}.entrypoints`]: "web",
          [`traefik.http.routers.${router}.middlewares`]: "sandbox-auth@docker",
          [`traefik.http.services.${router}.loadbalancer.server.port`]: "8443",
        },
      });
      await container.start();
      await prismaClient.sandbox.update({
        where: { projectId },
        data: { containerId: container.id, status: "RUNNING", lastSeenAt: new Date() },
      });
      return container.id;
    } catch (err) {
      await prismaClient.sandbox.update({
        where: { projectId },
        data: { status: "ERROR", containerId: null },
      });
      throw err;
    }
  }

  async stop(projectId: string, deleteWorkspace = false): Promise<void> {
    return this.withProjectLock(projectId, () => this.stopLocked(projectId, deleteWorkspace));
  }

  private async stopLocked(projectId: string, deleteWorkspace: boolean): Promise<void> {
    const row = await prismaClient.sandbox.findUnique({ where: { projectId } });
    if (row?.containerId) await this.removeContainer(row.containerId);
    if (!row) return;
    await prismaClient.sandbox.update({
      where: { projectId },
      data: { status: "STOPPED", containerId: null },
    });
    if (deleteWorkspace) await this.fs.deleteWorkspace(row.userId, projectId);
  }

  /** Run a command inside the project container only (SEC-03, BIZ-03). */
  async exec(input: {
    projectId: string;
    userId: string;
    command: string;
    cwd?: string;
    timeoutMs?: number;
  }): Promise<ExecResult> {
    const dir = await this.fs.ensureWorkspace(input.userId, input.projectId);
    const cwd = input.cwd && input.cwd !== "." ? input.cwd : ".";
    if (cwd !== ".") await resolveInsideSafe(dir, cwd, { allowRoot: true });

    const { containerId } = await this.ensure({ projectId: input.projectId, userId: input.userId });
    const execution = await this.docker.getContainer(containerId).exec({
      Cmd: ["/bin/bash", "-lc", input.command],
      WorkingDir: cwd === "." ? "/workspace" : `/workspace/${cwd}`,
      User: "abc",
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await execution.start({ hijack: true, stdin: false });

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let bytes = 0;
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      if (bytes >= MAX_EXEC_OUTPUT_BYTES) return;
      target.push(chunk);
      bytes += chunk.length;
    };
    const stdout = new PassThrough().on("data", collect(out));
    const stderr = new PassThrough().on("data", collect(err));
    this.docker.modem.demuxStream(stream, stdout, stderr);

    let timedOut = false;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        timedOut = true;
        stream.destroy();
        resolve();
      }, input.timeoutMs ?? 120_000);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      stream.on("end", done).on("close", done).on("error", done);
    });

    let exitCode = 124;
    if (!timedOut) {
      exitCode = (await execution.inspect().catch(() => ({ ExitCode: 1 }))).ExitCode ?? 1;
    }
    await prismaClient.sandbox.update({
      where: { projectId: input.projectId },
      data: { lastSeenAt: new Date() },
    });
    return {
      exitCode,
      stdout: Buffer.concat(out).toString("utf-8"),
      stderr: Buffer.concat(err).toString("utf-8"),
      timedOut,
    };
  }

  async startProcess(input: {
    projectId: string;
    userId: string;
    name: string;
    command: string;
    cwd?: string;
  }): Promise<{ name: string; pid?: number }> {
    const pid = `/tmp/processes/${input.name}.pid`;
    const logFile = `/tmp/processes/${input.name}.log`;
    // Newline-joined: "cmd &; next" is a bash syntax error.
    const script = [
      "set -e",
      "mkdir -p /tmp/processes",
      `if [ -f ${pid} ]; then kill $(cat ${pid}) 2>/dev/null || true; fi`,
      `setsid nohup /bin/bash -lc ${shellQuote(input.command)} > ${logFile} 2>&1 < /dev/null &`,
      `echo $! > ${pid}`,
      `cat ${pid}`,
    ].join("\n");
    const res = await this.exec({ ...input, command: script, timeoutMs: 15_000 });
    if (res.exitCode !== 0) {
      throw new HttpError(
        422,
        "PROCESS_START_FAILED",
        `Failed to start process '${input.name}': ${(res.stderr || res.stdout).slice(0, 500)}`
      );
    }
    const parsed = Number.parseInt(res.stdout.trim(), 10);
    return { name: input.name, pid: Number.isFinite(parsed) ? parsed : undefined };
  }

  async stopProcess(input: { projectId: string; userId: string; name: string }): Promise<void> {
    const pid = `/tmp/processes/${input.name}.pid`;
    await this.exec({
      ...input,
      command: `if [ -f ${pid} ]; then kill $(cat ${pid}) 2>/dev/null || true; rm -f ${pid}; fi`,
      timeoutMs: 10_000,
    });
  }

  async snapshot(input: { projectId: string; userId: string; message: string }): Promise<void> {
    const msg = input.message.replace(/[^\w .,:#()-]/g, "").slice(0, 120) || "Agent run";
    await this.exec({
      ...input,
      command: [
        "[ -d .git ] || git init -q -b main",
        "git add -A",
        `git diff --cached --quiet || git -c user.name='Software Agent' -c user.email=agent@localhost commit -q -m ${shellQuote(msg)}`,
      ].join(" && "),
      timeoutMs: 30_000,
    });
  }

  /** Traefik forwardAuth check for `{projectId}.{baseDomain}` (SEC-07). */
  async verifyForwardAuth(input: {
    host: string;
    uri: string;
    cookie?: string;
  }): Promise<{ ok: boolean; projectId?: string; setCookie?: string }> {
    const host = (input.host.split(":")[0] ?? "").toLowerCase();
    const suffix = `.${this.config.baseDomain.toLowerCase()}`;
    if (!host.endsWith(suffix)) return { ok: false };
    const projectId = host.slice(0, -suffix.length);
    if (!/^[a-f0-9-]{36}$/.test(projectId)) return { ok: false };

    const row = await prismaClient.sandbox.findUnique({ where: { projectId } });
    if (!row || row.status !== "RUNNING") return { ok: false };

    let queryToken: string | null = null;
    try {
      queryToken = new URL(input.uri || "/", "http://x").searchParams.get("tkn");
    } catch {
      queryToken = null;
    }
    // Host-only cookie, so one fixed name is still scoped per sandbox. The name must match
    // forwardauth.addAuthCookiesToResponse in docker-compose.yml.
    const cookieName = SESSION_COOKIE;
    // Browsers drop `Secure` cookies set over plain HTTP, and SameSite=None requires Secure.
    const cookieAttrs = this.config.protocol === "https" ? "Secure; SameSite=None" : "SameSite=Lax";
    const cookieToken = parseCookie(input.cookie ?? "", cookieName);
    const candidate = queryToken || cookieToken;
    if (!candidate) return { ok: false };
    if (!constantTimeTokenEquals(hashSessionToken(candidate), row.sessionTokenHash)) {
      return { ok: false };
    }
    await prismaClient.sandbox.update({
      where: { id: row.id },
      data: { lastSeenAt: new Date() },
    });
    return {
      ok: true,
      projectId,
      setCookie: queryToken
        ? `${cookieName}=${encodeURIComponent(queryToken)}; Path=/; HttpOnly; ${cookieAttrs}; Max-Age=${this.config.idleMinutes * 60}`
        : undefined,
    };
  }

  startReaper(): void {
    if (this.reaper) return;
    this.reaper = setInterval(() => {
      this.reap().catch((err) => this.log.warn({ err }, "sandbox reaper failed"));
    }, 60_000);
    this.reaper.unref();
  }

  async reap(): Promise<number> {
    const now = Date.now();
    const stale = await prismaClient.sandbox.findMany({
      where: {
        status: { in: ["RUNNING", "STARTING"] },
        OR: [
          { lastSeenAt: { lt: new Date(now - this.config.idleMinutes * 60_000) } },
          { createdAt: { lt: new Date(now - this.config.maxAgeMinutes * 60_000) } },
        ],
      },
    });
    for (const row of stale) {
      this.log.info({ projectId: row.projectId }, "reaping sandbox");
      await this.stop(row.projectId);
    }
    return stale.length;
  }
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}
