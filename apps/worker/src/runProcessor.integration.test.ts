import crypto from "crypto";
import http from "http";
import type { AddressInfo } from "net";
import { prismaClient } from "db";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ControllerHttp } from "./controllerClient";
import { createFakeBuilderProvider, processRun } from "./runProcessor";

// Explicit opt-in: Prisma auto-loads .env files, so DATABASE_URL alone may point at a real database.
const runIntegration = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!runIntegration)("processRun against Postgres", () => {
  const files = new Map<string, string>();
  const calls: string[] = [];
  let server: http.Server;
  let baseUrl = "";
  const userId = `user_worker_${crypto.randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        calls.push(req.url ?? "");
        if (req.headers["x-internal-token"] !== "test-internal-token-123") {
          res.writeHead(401).end();
          return;
        }
        const body = JSON.parse(raw || "{}") as Record<string, unknown>;
        const json = (data: unknown) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(data));
        };
        switch (req.url) {
          case "/internal/sandboxes/ensure":
            return json({
              projectId: body.projectId,
              status: "RUNNING",
              ideUrl: "https://ide.example.test/",
              previewUrl: null,
              previewPort: null,
              previewPath: null,
              expiresAt: new Date().toISOString(),
            });
          case "/internal/files/list":
            return json({ entries: [...files.keys()].map((path) => ({ path, type: "file" })) });
          case "/internal/files/write":
            files.set(String(body.path), String(body.content));
            res.writeHead(204).end();
            return;
          case "/internal/snapshot":
            res.writeHead(204).end();
            return;
          default:
            res.writeHead(404).end();
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await prismaClient.user.create({ data: { id: userId } });
  });

  afterAll(async () => {
    server.close();
    await prismaClient.user.deleteMany({ where: { id: userId } });
    await prismaClient.$disconnect();
  });

  async function queueRun(projectId: string, prompt: string) {
    const run = await prismaClient.run.create({ data: { projectId, idempotencyKey: crypto.randomUUID() } });
    await prismaClient.message.create({
      data: { projectId, runId: run.id, role: "USER", content: [{ type: "text", text: prompt }] },
    });
    return run;
  }

  it("runs the agent, persists ordered events, messages, usage, and snapshots", async () => {
    const project = await prismaClient.project.create({ data: { userId, name: "Timer" } });
    const run = await queueRun(project.id, "Build a pomodoro timer");
    const deps = {
      controller: new ControllerHttp(baseUrl, "test-internal-token-123"),
      provider: createFakeBuilderProvider(),
      logger: pino({ level: "silent" }),
      runTimeoutMs: 60_000,
    };

    await processRun(run.id, deps);

    const finished = await prismaClient.run.findUniqueOrThrow({ where: { id: run.id } });
    expect(finished.status).toBe("SUCCEEDED");
    expect(finished.outputTokens).toBeGreaterThan(0);
    expect(files.get("index.html")).toContain("Build a pomodoro timer");

    const events = await prismaClient.runEvent.findMany({ where: { runId: run.id }, orderBy: { seq: "asc" } });
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i));
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["tool_call", "tool_result", "file_changed"]));
    expect(events[events.length - 1]?.type).toBe("done");

    const messages = await prismaClient.message.findMany({ where: { projectId: project.id } });
    expect(messages.length).toBeGreaterThanOrEqual(3);
    const usage = await prismaClient.usageLedger.findFirstOrThrow({ where: { userId } });
    expect(usage.runs).toBe(1);
    expect(calls).toContain("/internal/snapshot");

    // A second call is a no-op: the run can only be claimed once.
    await processRun(run.id, deps);
    expect(await prismaClient.runEvent.count({ where: { runId: run.id } })).toBe(events.length);

    // Follow-up message on the same project works with the same provider instance.
    const second = await queueRun(project.id, "Add a reset button");
    await processRun(second.id, deps);
    expect((await prismaClient.run.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("SUCCEEDED");
    expect(files.get("index.html")).toContain("Add a reset button");
  });

  it("skips runs cancelled before a worker picked them up", async () => {
    const project = await prismaClient.project.create({ data: { userId, name: "Cancelled" } });
    const run = await queueRun(project.id, "Never mind");
    await prismaClient.run.update({ where: { id: run.id }, data: { status: "CANCELLED" } });
    await processRun(run.id, {
      controller: new ControllerHttp(baseUrl, "test-internal-token-123"),
      provider: createFakeBuilderProvider(),
      logger: pino({ level: "silent" }),
      runTimeoutMs: 60_000,
    });
    expect(await prismaClient.runEvent.count({ where: { runId: run.id } })).toBe(0);
  });
});
