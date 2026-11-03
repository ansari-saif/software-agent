import http from "http";
import PgBoss from "pg-boss";
import { createLogger } from "@repo/observability";
import { prismaClient } from "db";
import { ControllerHttp } from "./controllerClient";
import { createProviderFromEnv, failStaleRuns, processRun } from "./runProcessor";

export const AGENT_RUN_QUEUE = "agent-run";

const logger = createLogger("worker");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  const internalToken = requireEnv("INTERNAL_API_TOKEN");
  const controllerUrl = requireEnv("CONTROLLER_URL");
  const concurrency = Math.max(1, Number(process.env.MAX_CONCURRENT_RUNS || 2));
  const runTimeoutMs = Number(process.env.AGENT_RUN_TIMEOUT_MINUTES || 30) * 60_000;

  const deps = {
    controller: new ControllerHttp(controllerUrl, internalToken),
    provider: createProviderFromEnv(),
    logger,
    runTimeoutMs,
  };

  await failStaleRuns(runTimeoutMs, logger);

  const boss = new PgBoss({ connectionString: databaseUrl, application_name: "worker" });
  boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
  await boss.start();
  await boss.createQueue(AGENT_RUN_QUEUE);

  for (let i = 0; i < concurrency; i++) {
    await boss.work<{ runId: string }>(AGENT_RUN_QUEUE, { batchSize: 1 }, async (jobs) => {
      for (const job of jobs) {
        await processRun(job.data.runId, deps);
      }
    });
  }

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      prismaClient.$queryRaw`SELECT 1`
        .then(() => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, service: "worker" }));
        })
        .catch(() => {
          res.writeHead(503);
          res.end();
        });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const port = Number(process.env.PORT || 9091);
  server.listen(port, () => logger.info({ port, concurrency }, "worker started"));

  const shutdown = async (): Promise<void> => {
    logger.info("shutting down worker");
    server.close();
    await boss.stop({ graceful: true, timeout: 30_000 }).catch(() => undefined);
    await prismaClient.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main().catch((err) => {
  logger.fatal({ err }, "worker failed to start");
  process.exit(1);
});
