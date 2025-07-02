-- CreateTable
CREATE TABLE "BackendPrompt" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "promptType" "PromptType" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackendPrompt_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BackendPrompt" ADD CONSTRAINT "BackendPrompt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
