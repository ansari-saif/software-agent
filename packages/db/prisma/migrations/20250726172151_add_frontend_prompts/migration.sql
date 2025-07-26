-- CreateTable
CREATE TABLE "FrontendPrompt" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "promptType" "PromptType" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FrontendPrompt_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FrontendPrompt" ADD CONSTRAINT "FrontendPrompt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
