import crypto from "crypto";
import { Readable } from "stream";
import { createProjectOwnershipGuard, createUserAuthMiddleware } from "@repo/auth";
import {
  AccessEmailRequestSchema,
  buildPlatformOpenApiSpec,
  CreateProjectRequestSchema,
  deriveProjectName,
  PaginationQuerySchema,
  SendMessageRequestSchema,
  UpdateProjectRequestSchema,
  type AccessListResponse,
  type AccessPerson,
  type ContentBlock,
  type CreateProjectWithRunResponse,
  type PaginatedMessagesResponse,
  type PaginatedProjectsResponse,
  type RunEvent,
  type SendMessageResponse,
} from "@repo/contracts";
import { metrics, requestContextMiddleware } from "@repo/observability";
import { Prisma, prismaClient, type Project } from "db";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Logger } from "pino";
import { z } from "zod";
import {
  AccessStoreError,
  createPortalGate,
  createPrismaAccessStore,
  lookupClerkPrimaryEmail,
  portalFrom,
  type AccessRecord,
  type AccessStore,
} from "./access";
import type { ApiConfig } from "./config";
import type { SandboxController } from "./controller";
import { ApiError, errorHandler, notFound } from "./errors";
import { rateLimitMiddleware, type RateLimitConsumer } from "./rateLimit";
import type { RunEventHub } from "./runEventHub";
import { toMessageResponse, toProjectResponse, toRunResponse } from "./serializers";

export interface ApiDeps {
  config: Pick<
    ApiConfig,
    | "clerkPublicKey"
    | "clerkAuthorizedParties"
    | "clerkIssuer"
    | "corsOrigins"
    | "rateLimitPerMinute"
    | "dailyTokenQuota"
    | "dailyRunQuota"
    | "clerkSecretKey"
  >;
  logger: Logger;
  controller: SandboxController;
  runEvents: RunEventHub;
  enqueueRun: (runId: string) => Promise<void>;
  consumeRateLimit: RateLimitConsumer;
  /** Defaults to Prisma. Tests inject a memory store so auth checks stay DB-free. */
  access?: AccessStore;
  /** Defaults to the Clerk Backend API. Tests inject a stub. Never log its payload. */
  lookupClerkEmail?: (userId: string) => Promise<string | null>;
  /** Defaults to a Prisma user upsert. `knownUsers` may skip repeats; it must not skip the access check. */
  ensureUser?: (userId: string, email: string) => Promise<void>;
}

/** Routes that intentionally skip user auth. Everything else must return 401 without a token. */
export const PUBLIC_ROUTES = new Set(["GET /health", "GET /ready"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IdempotencyKeySchema = z.string().trim().min(8).max(200);
const FilesQuerySchema = z.object({ path: z.string().max(1000).optional().default("."), read: z.string().max(1000).optional() });

type ProjectRequest = Request & { project: Project };

function project(req: Request): Project {
  return (req as ProjectRequest).project;
}

function runIdParam(req: Request): string {
  const raw: unknown = req.params.runId;
  if (typeof raw !== "string" || !UUID_RE.test(raw)) throw notFound("Run");
  return raw;
}

function userId(req: Request): string {
  if (!req.userId) throw new ApiError("UNAUTHORIZED", "Authentication required");
  return req.userId;
}

function idempotencyKey(req: Request): string {
  const header = req.header("idempotency-key");
  if (!header) return crypto.randomUUID();
  const parsed = IdempotencyKeySchema.safeParse(header);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Idempotency-Key must be 8-200 characters");
  return parsed.data;
}

function buildUserContent(prompt: string, images: ContentBlock[]): ContentBlock[] {
  return [...images, ...(prompt ? [{ type: "text" as const, text: prompt }] : [])];
}

function nextUtcMidnight(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function assertWithinQuota(uid: string, config: ApiDeps["config"]): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const usage = await prismaClient.usageLedger.findUnique({ where: { userId_day: { userId: uid, day } } });
  if (!usage) return;
  if (usage.inputTokens + usage.outputTokens >= config.dailyTokenQuota || usage.runs >= config.dailyRunQuota) {
    throw new ApiError("QUOTA_EXCEEDED", "Daily usage limit reached. Try again tomorrow.", {
      resetAt: nextUtcMidnight().toISOString(),
    });
  }
}

async function failRunAfterEnqueueError(runId: string): Promise<void> {
  await prismaClient.run.updateMany({
    where: { id: runId, status: "QUEUED" },
    data: { status: "FAILED", error: "Could not queue the run", finishedAt: new Date() },
  });
}

export function createApp(deps: ApiDeps): express.Express {
  const { config, logger } = deps;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(requestContextMiddleware(logger));
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    const origin = req.header("origin");
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key, Last-Event-ID");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Expose-Headers", "x-request-id, Retry-After");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: "8mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "api" });
  });
  app.get("/ready", async (_req, res) => {
    try {
      await prismaClient.$queryRaw`SELECT 1`;
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });
    }
  });

  const knownUsers = new Set<string>();
  const authOptions = {
    publicKey: config.clerkPublicKey,
    authorizedParties: config.clerkAuthorizedParties,
    issuer: config.clerkIssuer,
  };
  const ensureUser =
    deps.ensureUser ??
    (async (id: string, email: string) => {
      // Repeat upserts can be skipped. The portal role is resolved on every request.
      if (knownUsers.has(id)) return;
      await prismaClient.user.upsert({
        where: { id },
        update: email ? { email } : {},
        create: { id, email: email || null },
      });
      if (knownUsers.size > 10_000) knownUsers.clear();
      knownUsers.add(id);
    });
  const access = deps.access ?? createPrismaAccessStore();
  const { identify, requireProduct, requireSuperadmin, touchAllowed } = createPortalGate({
    access,
    ensureUser,
    lookupClerkEmail:
      deps.lookupClerkEmail ?? ((userId) => lookupClerkPrimaryEmail(userId, config.clerkSecretKey ?? "")),
  });
  const requireUser = createUserAuthMiddleware(authOptions);
  // EventSource cannot send headers, so the SSE route alone accepts ?token=.
  const requireUserForStream = createUserAuthMiddleware({ ...authOptions, allowQueryToken: true });

  const ipLimiter = rateLimitMiddleware(deps.consumeRateLimit, {
    prefix: "ip",
    limit: config.rateLimitPerMinute * 3,
    windowMs: 60_000,
    keyOf: (req) => req.ip,
  });
  const userLimiter = rateLimitMiddleware(deps.consumeRateLimit, {
    prefix: "user",
    limit: config.rateLimitPerMinute,
    windowMs: 60_000,
    keyOf: (req) => req.userId,
  });
  const runLimiter = rateLimitMiddleware(deps.consumeRateLimit, {
    prefix: "runs",
    limit: Math.max(1, Math.ceil(config.rateLimitPerMinute / 10)),
    windowMs: 60_000,
    keyOf: (req) => req.userId,
  });

  const requireProjectOwner = createProjectOwnershipGuard<Project>(async (projectId, uid) => {
    if (!UUID_RE.test(projectId)) return null;
    return prismaClient.project.findFirst({ where: { id: projectId, userId: uid } });
  });

  const v1 = express.Router();
  const authed = [ipLimiter, requireUser, userLimiter];
  const product = [...authed, identify, requireProduct];

  const accessPerson = (row: AccessRecord): AccessPerson => ({
    email: row.email,
    createdAt: row.createdAt.toISOString(),
  });

  function accessEmail(body: unknown): string {
    const parsed = AccessEmailRequestSchema.safeParse(body);
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "invalid email");
    return parsed.data.email;
  }

  async function mutateAccess(res: Response, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (err) {
      if (err instanceof AccessStoreError) throw new ApiError("VALIDATION_ERROR", err.message);
      throw err;
    }
    res.json({ ok: true });
  }

  v1.get("/me", ...authed, identify, async (_req, res) => {
    await touchAllowed(res);
    const portal = portalFrom(res);
    res.json({ email: portal.email, role: portal.role });
  });

  v1.post("/access/request", ...authed, identify, async (_req, res) => {
    const portal = portalFrom(res);
    try {
      await access.request(portal.email);
    } catch (err) {
      if (err instanceof AccessStoreError) throw new ApiError("VALIDATION_ERROR", err.message);
      throw err;
    }
    await touchAllowed(res);
    res.json({ ok: true });
  });

  v1.get("/access", ...authed, identify, requireSuperadmin, async (_req, res) => {
    const list = await access.list();
    const body: AccessListResponse = {
      requests: list.requests.map(accessPerson),
      enabled: list.enabled.map(accessPerson),
    };
    res.json(body);
  });

  v1.post("/access", ...authed, identify, requireSuperadmin, async (req, res) => {
    const email = accessEmail(req.body);
    await mutateAccess(res, () => access.enable(email));
  });

  v1.delete("/access/request", ...authed, identify, requireSuperadmin, async (req, res) => {
    const email = accessEmail(req.body);
    await mutateAccess(res, () => access.dismissPending(email));
  });

  v1.delete("/access", ...authed, identify, requireSuperadmin, async (req, res) => {
    const email = accessEmail(req.body);
    await mutateAccess(res, () => access.removeEnabled(email));
  });

  v1.get("/openapi.json", ...product, (_req, res) => {
    res.json(buildPlatformOpenApiSpec());
  });

  v1.get("/projects", ...product, async (req, res) => {
    const { cursor, limit } = PaginationQuerySchema.parse(req.query);
    const rows = await prismaClient.project.findMany({
      where: { userId: userId(req) },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, limit);
    const body: PaginatedProjectsResponse = {
      items: items.map(toProjectResponse),
      nextCursor: rows.length > limit ? (items[items.length - 1]?.id ?? null) : null,
    };
    res.json(body);
  });

  v1.post("/projects", ...product, runLimiter, async (req, res) => {
    const uid = userId(req);
    const input = CreateProjectRequestSchema.parse(req.body);
    const key = idempotencyKey(req);

    const existing = await prismaClient.run.findFirst({
      where: { idempotencyKey: key, project: { userId: uid } },
      include: { project: true, messages: { where: { role: "USER" }, orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (existing?.messages[0]) {
      const replay: CreateProjectWithRunResponse = {
        project: toProjectResponse(existing.project),
        message: toMessageResponse(existing.messages[0]),
        run: toRunResponse(existing),
      };
      res.status(200).json(replay);
      return;
    }

    await assertWithinQuota(uid, config);
    const created = await prismaClient.$transaction(async (tx) => {
      const proj = await tx.project.create({
        data: {
          userId: uid,
          name: input.name ?? deriveProjectName(input.prompt || "Image prompt"),
          instructions: input.instructions ?? null,
        },
      });
      const run = await tx.run.create({ data: { projectId: proj.id, idempotencyKey: key } });
      const message = await tx.message.create({
        data: {
          projectId: proj.id,
          runId: run.id,
          role: "USER",
          content: buildUserContent(input.prompt, input.images) as Prisma.InputJsonValue,
        },
      });
      return { project: proj, run, message };
    });

    try {
      await deps.enqueueRun(created.run.id);
    } catch (err) {
      req.log?.error({ err, runId: created.run.id }, "failed to enqueue run");
      await failRunAfterEnqueueError(created.run.id);
      throw new ApiError("INTERNAL_ERROR", "Could not start the agent. Please retry.", { status: 503 });
    }
    metrics.recordRunStarted();
    const body: CreateProjectWithRunResponse = {
      project: toProjectResponse(created.project),
      message: toMessageResponse(created.message),
      run: toRunResponse(created.run),
    };
    res.status(201).json(body);
  });

  v1.get("/projects/:projectId", ...product, requireProjectOwner, (req, res) => {
    res.json(toProjectResponse(project(req)));
  });

  v1.patch("/projects/:projectId", ...product, requireProjectOwner, async (req, res) => {
    const input = UpdateProjectRequestSchema.parse(req.body);
    const updated = await prismaClient.project.update({
      where: { id: project(req).id },
      data: input,
    });
    res.json(toProjectResponse(updated));
  });

  v1.delete("/projects/:projectId", ...product, requireProjectOwner, async (req, res) => {
    const p = project(req);
    await prismaClient.run.updateMany({
      where: { projectId: p.id, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
    try {
      await deps.controller.stop({ projectId: p.id, userId: p.userId, deleteWorkspace: true });
    } catch (err) {
      req.log?.warn({ err, projectId: p.id }, "sandbox cleanup failed during project delete");
    }
    await prismaClient.project.delete({ where: { id: p.id } });
    res.status(204).end();
  });

  v1.get("/projects/:projectId/messages", ...product, requireProjectOwner, async (req, res) => {
    const p = project(req);
    const { cursor, limit } = PaginationQuerySchema.parse(req.query);
    const rows = await prismaClient.message.findMany({
      where: { projectId: p.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const activeRun = await prismaClient.run.findFirst({
      where: { projectId: p.id, status: { in: ["QUEUED", "RUNNING"] } },
      select: { id: true, status: true },
    });
    const body: PaginatedMessagesResponse = {
      items: page.reverse().map(toMessageResponse),
      nextCursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null,
      activeRun,
    };
    res.json(body);
  });

  v1.post("/projects/:projectId/messages", ...product, runLimiter, requireProjectOwner, async (req, res) => {
    const p = project(req);
    const input = SendMessageRequestSchema.parse(req.body);
    const key = idempotencyKey(req);

    const existing = await prismaClient.run.findUnique({
      where: { projectId_idempotencyKey: { projectId: p.id, idempotencyKey: key } },
      include: { messages: { where: { role: "USER" }, orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (existing?.messages[0]) {
      const replay: SendMessageResponse = {
        message: toMessageResponse(existing.messages[0]),
        run: toRunResponse(existing),
      };
      res.status(200).json(replay);
      return;
    }

    await assertWithinQuota(p.userId, config);
    let created;
    try {
      created = await prismaClient.$transaction(async (tx) => {
        const run = await tx.run.create({ data: { projectId: p.id, idempotencyKey: key } });
        const message = await tx.message.create({
          data: {
            projectId: p.id,
            runId: run.id,
            role: "USER",
            content: buildUserContent(input.prompt, input.images) as Prisma.InputJsonValue,
          },
        });
        await tx.project.update({ where: { id: p.id }, data: { updatedAt: new Date() } });
        return { run, message };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiError("CONFLICT", "The agent is already working on this project. Wait or cancel it first.");
      }
      throw err;
    }

    try {
      await deps.enqueueRun(created.run.id);
    } catch (err) {
      req.log?.error({ err, runId: created.run.id }, "failed to enqueue run");
      await failRunAfterEnqueueError(created.run.id);
      throw new ApiError("INTERNAL_ERROR", "Could not start the agent. Please retry.", { status: 503 });
    }
    const body: SendMessageResponse = {
      message: toMessageResponse(created.message),
      run: toRunResponse(created.run),
    };
    res.status(201).json(body);
  });

  v1.post("/projects/:projectId/sandbox", ...product, requireProjectOwner, async (req, res) => {
    const p = project(req);
    const session = await deps.controller.ensure({
      projectId: p.id,
      userId: p.userId,
      previewPort: p.previewPort,
      previewPath: p.previewPath,
    });
    res.json(session);
  });

  v1.delete("/projects/:projectId/sandbox", ...product, requireProjectOwner, async (req, res) => {
    const p = project(req);
    await deps.controller.stop({ projectId: p.id, userId: p.userId });
    res.status(204).end();
  });

  v1.get("/projects/:projectId/files", ...product, requireProjectOwner, async (req, res) => {
    const p = project(req);
    const query = FilesQuerySchema.parse(req.query);
    const ref = { projectId: p.id, userId: p.userId };
    if (query.read) {
      res.json(await deps.controller.readFile({ ...ref, path: query.read }));
      return;
    }
    res.json(await deps.controller.listFiles({ ...ref, path: query.path }));
  });

  v1.get("/projects/:projectId/export", ...product, requireProjectOwner, async (req, res) => {
    const p = project(req);
    const body = await deps.controller.exportArchive({ projectId: p.id, userId: p.userId });
    const filename = `${p.name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "project"}.tar.gz`;
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  });

  v1.post("/runs/:runId/cancel", ...product, async (req, res) => {
    const runId = runIdParam(req);
    const run = await prismaClient.run.findFirst({ where: { id: runId, project: { userId: userId(req) } } });
    if (!run) throw notFound("Run");

    const fromQueued = await prismaClient.run.updateMany({
      where: { id: run.id, status: "QUEUED" },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
    if (fromQueued.count > 0) {
      // No worker owns this run, so the API must close the event stream itself.
      const last = await prismaClient.runEvent.findFirst({ where: { runId: run.id }, orderBy: { seq: "desc" } });
      await prismaClient.runEvent.create({
        data: { runId: run.id, seq: (last?.seq ?? -1) + 1, type: "done", payload: { status: "CANCELLED" } },
      });
      await prismaClient.$executeRaw`SELECT pg_notify('run_events', ${JSON.stringify({ runId: run.id })})`;
    } else {
      await prismaClient.run.updateMany({
        where: { id: run.id, status: "RUNNING" },
        data: { status: "CANCELLED" },
      });
    }
    const updated = await prismaClient.run.findUniqueOrThrow({ where: { id: run.id } });
    res.json(toRunResponse(updated));
  });

  v1.get("/runs/:runId/events", ipLimiter, requireUserForStream, identify, requireProduct, async (req, res) => {
    const runId = runIdParam(req);
    const run = await prismaClient.run.findFirst({ where: { id: runId, project: { userId: userId(req) } } });
    if (!run) throw notFound("Run");

    const rawLast = req.header("last-event-id") ?? (typeof req.query.lastEventId === "string" ? req.query.lastEventId : undefined);
    let lastSeq = rawLast !== undefined && /^\d+$/.test(rawLast) ? Number(rawLast) : -1;

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write("retry: 3000\n\n");

    let closed = false;
    let draining = false;
    let pending = false;
    const finish = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    };

    const drain = async (): Promise<void> => {
      if (draining) {
        pending = true;
        return;
      }
      draining = true;
      try {
        do {
          pending = false;
          const events = await prismaClient.runEvent.findMany({
            where: { runId, seq: { gt: lastSeq } },
            orderBy: { seq: "asc" },
            take: 500,
          });
          for (const e of events) {
            if (closed) return;
            const event: RunEvent = {
              id: e.id,
              runId: e.runId,
              seq: e.seq,
              type: e.type as RunEvent["type"],
              payload: (e.payload ?? {}) as Record<string, unknown>,
              createdAt: e.createdAt.toISOString(),
            };
            res.write(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(event)}\n\n`);
            lastSeq = e.seq;
            if (e.type === "done") {
              finish();
              return;
            }
          }
          if (events.length === 500) pending = true;
        } while (pending && !closed);
      } catch (err) {
        req.log?.error({ err, runId }, "SSE drain failed");
        finish();
      } finally {
        draining = false;
      }
    };

    const unsubscribe = deps.runEvents.subscribe(runId, () => void drain());
    const heartbeat = setInterval(() => {
      if (!closed) res.write(": ping\n\n");
    }, 15_000);
    req.on("close", finish);
    await drain();

    const current = await prismaClient.run.findUnique({ where: { id: runId }, select: { status: true } });
    if (!closed && current && current.status !== "QUEUED" && current.status !== "RUNNING") {
      await drain();
      if (!closed) {
        res.write(`event: done\ndata: ${JSON.stringify({ runId, type: "done", payload: { status: current.status } })}\n\n`);
        finish();
      }
    }
  });

  app.use("/v1", v1);

  app.use((_req: Request, _res: Response, next: NextFunction) => next(notFound("Route")));
  app.use(errorHandler);
  return app;
}
