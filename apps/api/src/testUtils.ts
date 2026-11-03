import crypto from "crypto";
import jwt from "jsonwebtoken";
import pino from "pino";
import type { ApiDeps } from "./app";
import { LocalRunEventHub } from "./runEventHub";

export const TEST_AZP = "http://localhost:3000";

export function createTestKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    publicKey,
    sign: (sub: string, azp = TEST_AZP) =>
      jwt.sign({ sub, azp }, privateKey, { algorithm: "RS256", expiresIn: "5m" }),
  };
}

export function createTestDeps(publicKey: string, overrides: Partial<ApiDeps> = {}) {
  const enqueued: string[] = [];
  const runEvents = new LocalRunEventHub();
  const deps: ApiDeps = {
    config: {
      clerkPublicKey: publicKey,
      clerkAuthorizedParties: [TEST_AZP],
      corsOrigins: [TEST_AZP],
      rateLimitPerMinute: 10_000,
      dailyTokenQuota: 1_000_000,
      dailyRunQuota: 1_000,
    },
    logger: pino({ level: "silent" }),
    runEvents,
    enqueueRun: async (runId) => {
      enqueued.push(runId);
    },
    consumeRateLimit: async (_key, limit) => ({
      allowed: true,
      remaining: limit,
      resetAt: new Date(Date.now() + 60_000),
    }),
    controller: {
      ensure: async (ref) => ({
        projectId: ref.projectId,
        status: "RUNNING",
        ideUrl: "https://ide.example.test/",
        previewUrl: null,
        previewPort: null,
        previewPath: null,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
      stop: async () => undefined,
      listFiles: async () => ({ entries: [] }),
      readFile: async () => ({ content: "" }),
      exportArchive: async () => new Blob([]).stream() as ReadableStream<Uint8Array>,
    },
    ...overrides,
  };
  return { deps, enqueued, runEvents };
}
