-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('PENDING', 'ENABLED');

-- CreateTable
CREATE TABLE "PortalAccess" (
    "email" TEXT NOT NULL,
    "status" "AccessStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalAccess_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE INDEX "PortalAccess_status_createdAt_idx" ON "PortalAccess"("status", "createdAt");
