-- CreateEnum
CREATE TYPE "PromptType" AS ENUM ('USER', 'AGENT');

-- AlterTable
ALTER TABLE "Prompt" ADD COLUMN     "promptType" "PromptType" NOT NULL DEFAULT 'USER';
