/*
  Warnings:

  - You are about to drop the `BackendPrompt` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FrontendPrompt` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('BACKEND', 'FRONTEND', 'DB');

-- DropForeignKey
ALTER TABLE "BackendPrompt" DROP CONSTRAINT "BackendPrompt_projectId_fkey";

-- DropForeignKey
ALTER TABLE "FrontendPrompt" DROP CONSTRAINT "FrontendPrompt_projectId_fkey";

-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "agentType" "AgentType" NOT NULL DEFAULT 'BACKEND';

-- AlterTable
ALTER TABLE "Prompt" ADD COLUMN     "agentType" "AgentType" NOT NULL DEFAULT 'DB';

-- DropTable
DROP TABLE "BackendPrompt";

-- DropTable
DROP TABLE "FrontendPrompt";
