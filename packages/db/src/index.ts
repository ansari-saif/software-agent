import { PrismaClient, Prisma, Role, RunStatus, SandboxStatus, AccessStatus } from "@prisma/client";

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

export { PrismaClient, Prisma, Role, RunStatus, SandboxStatus, AccessStatus };
export type {
  User,
  Project,
  Message,
  Run,
  RunEvent,
  Sandbox,
  UsageLedger,
  RateLimit,
  PortalAccess,
} from "@prisma/client";
