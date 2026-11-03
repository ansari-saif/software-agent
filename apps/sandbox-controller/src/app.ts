import express, { type NextFunction, type Request, type Response } from "express";
import type { Logger } from "pino";
import { z } from "zod";
import { createInternalTokenMiddleware } from "@repo/auth";
import {
  ControllerEnsureSandboxRequestSchema,
  ControllerExecRequestSchema,
  ControllerFileEditRequestSchema,
  ControllerFilePathRequestSchema,
  ControllerFileWriteRequestSchema,
  ControllerProcessStartRequestSchema,
  ControllerProcessStopRequestSchema,
  ControllerSearchRequestSchema,
} from "@repo/contracts";
import { requestContextMiddleware } from "@repo/observability";
import { prismaClient } from "db";
import { PathContainmentError } from "./pathSafety";
import { HttpError, type SandboxManager } from "./sandboxManager";

const ProjectRefSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().min(1),
});

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

export function createControllerApp(deps: {
  manager: SandboxManager;
  internalToken: string;
  logger: Logger;
}): express.Express {
  const { manager, logger } = deps;
  const app = express();
  app.disable("x-powered-by");
  app.use(requestContextMiddleware(logger));
  app.use(express.json({ limit: "6mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "sandbox-controller" });
  });

  // Traefik forwardAuth: authenticates browser traffic to sandbox hosts.
  app.get(
    "/auth/forward",
    wrap(async (req, res) => {
      const result = await manager.verifyForwardAuth({
        host: req.header("x-forwarded-host") ?? "",
        uri: req.header("x-forwarded-uri") ?? "/",
        cookie: req.header("cookie"),
      });
      if (!result.ok) {
        res.status(401).send("Unauthorized");
        return;
      }
      if (result.setCookie) res.setHeader("Set-Cookie", result.setCookie);
      res.status(200).send("OK");
    })
  );

  const internal = express.Router();
  internal.use(createInternalTokenMiddleware(deps.internalToken));

  internal.post(
    "/sandboxes/ensure",
    wrap(async (req, res) => {
      const body = ControllerEnsureSandboxRequestSchema.parse(req.body);
      const { containerId: _containerId, ...session } = await manager.ensure(body);
      res.json(session);
    })
  );

  internal.post(
    "/sandboxes/stop",
    wrap(async (req, res) => {
      const body = ProjectRefSchema.extend({ deleteWorkspace: z.boolean().optional() }).parse(
        req.body
      );
      await manager.stop(body.projectId, body.deleteWorkspace ?? false);
      res.status(204).end();
    })
  );

  internal.post(
    "/files/list",
    wrap(async (req, res) => {
      const b = ControllerFilePathRequestSchema.parse(req.body);
      res.json({ entries: await manager.fs.listFiles(b.userId, b.projectId, b.path) });
    })
  );

  internal.post(
    "/files/read",
    wrap(async (req, res) => {
      const b = ControllerFilePathRequestSchema.parse(req.body);
      res.json({ content: await manager.fs.readFile(b.userId, b.projectId, b.path) });
    })
  );

  internal.post(
    "/files/search",
    wrap(async (req, res) => {
      const b = ControllerSearchRequestSchema.parse(req.body);
      res.json({ matches: await manager.fs.searchFiles(b.userId, b.projectId, b.query, b.path) });
    })
  );

  internal.post(
    "/files/write",
    wrap(async (req, res) => {
      const b = ControllerFileWriteRequestSchema.parse(req.body);
      await manager.fs.writeFile(b.userId, b.projectId, b.path, b.content);
      res.status(204).end();
    })
  );

  internal.post(
    "/files/edit",
    wrap(async (req, res) => {
      const b = ControllerFileEditRequestSchema.parse(req.body);
      res.json(
        await manager.fs.editFile(b.userId, b.projectId, b.path, b.oldString, b.newString, b.replaceAll)
      );
    })
  );

  internal.post(
    "/files/delete",
    wrap(async (req, res) => {
      const b = ControllerFilePathRequestSchema.parse(req.body);
      await manager.fs.deleteFile(b.userId, b.projectId, b.path);
      res.status(204).end();
    })
  );

  internal.post(
    "/files/export",
    wrap(async (req, res) => {
      const b = ProjectRefSchema.parse(req.body);
      const archive = await manager.fs.createTarGzArchive(b.userId, b.projectId);
      res.setHeader("Content-Type", "application/gzip");
      res.send(archive);
    })
  );

  internal.post(
    "/exec",
    wrap(async (req, res) => {
      const b = ControllerExecRequestSchema.parse(req.body);
      res.json(await manager.exec(b));
    })
  );

  internal.post(
    "/processes/start",
    wrap(async (req, res) => {
      const b = ControllerProcessStartRequestSchema.parse(req.body);
      res.json(await manager.startProcess(b));
    })
  );

  internal.post(
    "/processes/stop",
    wrap(async (req, res) => {
      const b = ControllerProcessStopRequestSchema.parse(req.body);
      await manager.stopProcess(b);
      res.status(204).end();
    })
  );

  internal.post(
    "/snapshot",
    wrap(async (req, res) => {
      const b = ProjectRefSchema.extend({ message: z.string().max(500) }).parse(req.body);
      await manager.snapshot(b);
      res.status(204).end();
    })
  );

  app.use("/internal", internal);

  app.get(
    "/ready",
    wrap(async (_req, res) => {
      await prismaClient.$queryRaw`SELECT 1`;
      res.json({ ok: true });
    })
  );

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", details: err.flatten() },
      });
      return;
    }
    if (err instanceof PathContainmentError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    const code = (err as { code?: string })?.code;
    if (code === "ENOENT") {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "File not found" } });
      return;
    }
    req.log?.error({ err }, "controller_error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal error" } });
  });

  return app;
}
