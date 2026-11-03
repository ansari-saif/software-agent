import { PrismaClient, Prisma, Role, RunStatus, SandboxStatus } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prismaClient?: PrismaClient;
};

export const prismaClient: PrismaClient =
  globalForPrisma.prismaClient ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaClient = prismaClient;
}

export { PrismaClient, Prisma, Role, RunStatus, SandboxStatus };
export type {
  User,
  Project,
  Message,
  Run,
  RunEvent,
  Sandbox,
  UsageLedger,
  RateLimit,
} from "@prisma/client";
