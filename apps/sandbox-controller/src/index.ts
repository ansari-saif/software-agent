import { createLogger } from "@repo/observability";
import { createControllerApp } from "./app";
import { SandboxManager, loadSandboxConfig } from "./sandboxManager";

const logger = createLogger("sandbox-controller");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main(): Promise<void> {
  const internalToken = requireEnv("INTERNAL_API_TOKEN");
  requireEnv("DATABASE_URL");
  requireEnv("DOCKER_PROXY_URL");

  const manager = new SandboxManager(loadSandboxConfig(), logger);
  await manager.reconcile().catch((err) => logger.error({ err }, "startup reconcile failed"));
  manager.startReaper();

  const app = createControllerApp({ manager, internalToken, logger });
  const port = Number(process.env.PORT || 7070);
  app.listen(port, () => logger.info({ port }, "sandbox-controller listening"));
}

main().catch((err) => {
  logger.fatal({ err }, "sandbox-controller failed to start");
  process.exit(1);
});
