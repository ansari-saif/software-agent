import PgBoss from "pg-boss";
import { createLogger } from "@repo/observability";
import { prismaClient } from "db";
import { createApp } from "./app";
import { loadApiConfig } from "./config";
import { HttpSandboxController } from "./controller";
import { consumePostgres, purgeExpiredRateLimits } from "./rateLimit";
import { PostgresRunEventHub } from "./runEventHub";

export const AGENT_RUN_QUEUE = "agent-run";

const logger = createLogger("api");

async function main(): Promise<void> {
  const config = loadApiConfig();

  const boss = new PgBoss({ connectionString: config.databaseUrl, application_name: "api" });
  boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
  await boss.start();
  await boss.createQueue(AGENT_RUN_QUEUE);

  const runEvents = new PostgresRunEventHub(config.databaseUrl, logger);
  await runEvents.start();

  const app = createApp({
    config,
    logger,
    controller: new HttpSandboxController(config.controllerUrl, config.internalToken),
    runEvents,
    consumeRateLimit: consumePostgres,
    enqueueRun: async (runId) => {
      const jobId = await boss.send(AGENT_RUN_QUEUE, { runId }, { retryLimit: 0, expireInHours: 1 });
      if (!jobId) throw new Error("pg-boss did not accept the job");
    },
  });

  const purgeTimer = setInterval(() => {
    purgeExpiredRateLimits().catch((err) => logger.warn({ err }, "rate limit purge failed"));
  }, 10 * 60_000);

  const server = app.listen(config.port, () => logger.info({ port: config.port }, "api listening"));

  const shutdown = async (): Promise<void> => {
    logger.info("shutting down api");
    clearInterval(purgeTimer);
    server.close();
    await runEvents.stop();
    await boss.stop({ graceful: true, timeout: 10_000 }).catch(() => undefined);
    await prismaClient.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main().catch((err) => {
  logger.fatal({ err }, "api failed to start");
  process.exit(1);
});
