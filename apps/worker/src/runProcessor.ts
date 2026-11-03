import { setMaxListeners } from "events";
import {
  AnthropicProvider,
  FakeModelProvider,
  runAgentLoop,
  type ConversationMessage,
  type ModelProvider,
} from "@repo/agent-core";
import { ContentBlockSchema, type SandboxSessionResponse } from "@repo/contracts";
import { metrics } from "@repo/observability";
import { Prisma, prismaClient } from "db";
import type { Logger } from "pino";
import { z } from "zod";
import { ControllerHttp, createSandboxClient } from "./controllerClient";
import { BufferedRunEventSink, type PersistedEvent } from "./eventSink";

export const RUN_EVENTS_CHANNEL = "run_events";

const StoredContentSchema = z.array(ContentBlockSchema);

export interface RunProcessorDeps {
  controller: ControllerHttp;
  provider: ModelProvider;
  logger: Logger;
  runTimeoutMs: number;
}

/** Deterministic provider for local dev and E2E: writes one page per user message, then stops. */
export function createFakeBuilderProvider(): ModelProvider {
  return new FakeModelProvider((input) => {
    const last = input.messages[input.messages.length - 1];
    const answeringUser = last?.role === "USER" && last.content.every((b) => b.type !== "tool_result");
    if (!answeringUser) {
      return {
        blocks: [{ type: "text", text: "Done. Open the preview to see it." }],
        stopReason: "end_turn",
        inputTokens: 10,
        outputTokens: 5,
        costMicros: 105,
      };
    }
    const request = last.content.find((b) => b.type === "text");
    const title = request?.type === "text" ? request.text.slice(0, 80) : "Your app";
    const safeTitle = title.replace(/[<>&"]/g, "");
    return {
      blocks: [
        { type: "text", text: "Writing a placeholder page." },
        {
          type: "tool_use",
          id: `fake_write_${input.messages.length}`,
          name: "write_file",
          input: { path: "index.html", content: `<!doctype html><title>${safeTitle}</title><h1>${safeTitle}</h1>` },
        },
      ],
      stopReason: "tool_use",
      inputTokens: 10,
      outputTokens: 10,
      costMicros: 180,
    };
  });
}

export function createProviderFromEnv(): ModelProvider {
  if (process.env.AGENT_PROVIDER === "fake") {
    return createFakeBuilderProvider();
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required (or set AGENT_PROVIDER=fake for local testing)");
  }
  return new AnthropicProvider();
}

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function persistEvents(runId: string, events: PersistedEvent[]): Promise<void> {
  await prismaClient.runEvent.createMany({
    data: events.map((e) => ({
      runId,
      seq: e.seq,
      type: e.type,
      payload: e.payload as Prisma.InputJsonValue,
    })),
  });
  const last = events[events.length - 1];
  const message = JSON.stringify({ runId, seq: last?.seq ?? 0 });
  await prismaClient.$executeRaw`SELECT pg_notify(${RUN_EVENTS_CHANNEL}, ${message})`;
}

export async function loadHistory(projectId: string): Promise<ConversationMessage[]> {
  const rows = await prismaClient.message.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  const history: ConversationMessage[] = [];
  for (const row of rows) {
    const parsed = StoredContentSchema.safeParse(row.content);
    if (parsed.success && parsed.data.length > 0) {
      history.push({ role: row.role, content: parsed.data });
    }
  }
  return history;
}

/** Processes one queued run end to end. Safe to call twice: only one caller can claim it. */
export async function processRun(runId: string, deps: RunProcessorDeps): Promise<void> {
  const log = deps.logger.child({ runId });
  const claimed = await prismaClient.run.updateMany({
    where: { id: runId, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  if (claimed.count === 0) {
    log.info("run not claimable (cancelled or already processed)");
    return;
  }

  const run = await prismaClient.run.findUniqueOrThrow({
    where: { id: runId },
    include: { project: true },
  });
  const { project } = run;
  const ref = { projectId: project.id, userId: project.userId };

  const lastEvent = await prismaClient.runEvent.findFirst({
    where: { runId },
    orderBy: { seq: "desc" },
  });
  const sink = new BufferedRunEventSink((events) => persistEvents(runId, events), (lastEvent?.seq ?? -1) + 1);

  const abort = new AbortController();
  // The model SDK adds an abort listener per step; a run can take up to AGENT_MAX_STEPS steps.
  setMaxListeners(200, abort.signal);
  const timeout = setTimeout(() => abort.abort(new Error("Run timed out")), deps.runTimeoutMs);
  const isCancelled = async (): Promise<boolean> => {
    const current = await prismaClient.run.findUnique({ where: { id: runId }, select: { status: true } });
    return current?.status === "CANCELLED";
  };
  const cancelPoll = setInterval(() => {
    isCancelled()
      .then((cancelled) => {
        if (cancelled) abort.abort(new Error("Run cancelled"));
      })
      .catch(() => undefined);
  }, 2000);

  metrics.recordRunStarted();
  let status: "SUCCEEDED" | "FAILED" | "CANCELLED" = "FAILED";
  let error: string | undefined;
  let inputTokens = 0;
  let outputTokens = 0;
  let costMicros = 0;

  try {
    const session = await deps.controller.post<SandboxSessionResponse>("/sandboxes/ensure", {
      ...ref,
      previewPort: project.previewPort,
      previewPath: project.previewPath,
      rotateToken: false,
    });
    const sandbox = createSandboxClient(deps.controller, ref, async ({ port, path }) => {
      await prismaClient.project.update({
        where: { id: project.id },
        data: { previewPort: port, previewPath: path },
      });
      const refreshed = await deps.controller.post<SandboxSessionResponse>("/sandboxes/ensure", {
        ...ref,
        previewPort: port,
        previewPath: path,
        rotateToken: false,
      });
      return { previewUrl: refreshed.previewUrl };
    });

    const fileTree = await sandbox
      .listFiles(".")
      .then((entries) => entries.map((e) => (e.type === "directory" ? `${e.path}/` : e.path)))
      .catch(() => []);

    await sink.emit("status", { status: "RUNNING", sandbox: session.status });

    const result = await runAgentLoop({
      projectId: project.id,
      userId: project.userId,
      runId,
      provider: deps.provider,
      sandbox,
      events: sink,
      history: await loadHistory(project.id),
      promptInput: { workspaceRoot: "/workspace", fileTree, projectInstructions: project.instructions },
      signal: abort.signal,
      isCancelled,
      onMessageCommitted: async (msg) => {
        await prismaClient.message.create({
          data: {
            projectId: project.id,
            runId,
            role: msg.role,
            content: msg.content as Prisma.InputJsonValue,
          },
        });
      },
    });

    status = result.status;
    error = result.error;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
    costMicros = result.costMicros;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    status = (await isCancelled()) ? "CANCELLED" : "FAILED";
    log.error({ err }, "run failed before or outside the agent loop");
    await sink.emit("error", { message: error });
    await sink.emit("done", { status, error });
  } finally {
    clearTimeout(timeout);
    clearInterval(cancelPoll);
    await sink.flush().catch((err) => log.error({ err }, "failed to flush run events"));
  }

  await prismaClient.run.updateMany({
    where: { id: runId, status: "RUNNING" },
    data: { status, error: error ?? null },
  });
  await prismaClient.run.update({
    where: { id: runId },
    data: { finishedAt: new Date(), inputTokens, outputTokens, costMicros },
  });
  await prismaClient.usageLedger.upsert({
    where: { userId_day: { userId: project.userId, day: utcDay() } },
    update: {
      inputTokens: { increment: inputTokens },
      outputTokens: { increment: outputTokens },
      costMicros: { increment: costMicros },
      runs: { increment: 1 },
    },
    create: {
      userId: project.userId,
      day: utcDay(),
      inputTokens,
      outputTokens,
      costMicros,
      runs: 1,
    },
  });
  metrics.recordRunCompleted(status, inputTokens, outputTokens, costMicros);

  if (status === "SUCCEEDED") {
    await deps.controller
      .post("/snapshot", { ...ref, message: `Run ${runId}` })
      .catch((err) => log.warn({ err }, "git snapshot failed"));
  }
  log.info({ status, inputTokens, outputTokens }, "run finished");
}

/** Fails runs left RUNNING by a crashed worker so the UI never waits forever. */
export async function failStaleRuns(olderThanMs: number, logger: Logger): Promise<void> {
  const stale = await prismaClient.run.findMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - olderThanMs) } },
  });
  for (const run of stale) {
    const updated = await prismaClient.run.updateMany({
      where: { id: run.id, status: "RUNNING" },
      data: { status: "FAILED", error: "Run was interrupted (worker restarted)", finishedAt: new Date() },
    });
    if (updated.count === 0) continue;
    const last = await prismaClient.runEvent.findFirst({ where: { runId: run.id }, orderBy: { seq: "desc" } });
    await persistEvents(run.id, [
      { seq: (last?.seq ?? -1) + 1, type: "done", payload: { status: "FAILED", error: "Run was interrupted" } },
    ]);
    logger.warn({ runId: run.id }, "marked stale run as failed");
  }
}
