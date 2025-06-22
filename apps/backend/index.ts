import { prismaClient } from "db/client";
import express from "express";
import cors from "cors";
import { authMiddleware } from "./middleware";
import Anthropic from "@anthropic-ai/sdk";
import { ArtifactProcessor } from "./parser";
import { onPromptEnd, onSchema, onSummery } from "./os";
import { systemPrompt } from "./systemPrompt";

const app = express();
app.use(express.json());
app.use(cors());

app.post("/project", authMiddleware, async (req, res) => {
  const { prompt } = req.body;
  const userId = req.userId!;
  const description = prompt.split(" ").slice(0, 2).join(" ");
  const project = await prismaClient.project.create({
    data: { description, userId },
  });
  res.json({
    projectId: project.id,
  });
});

app.post("/projects", authMiddleware, async (req, res) => {
  const userId = req.userId!;
  const projects = await prismaClient.project.findMany({
    where: { userId },
  });

  res.json(projects);
});

app.post("/prompt", async (req, res) => {
  let { prompt, projectId } = req.body;
  prompt = prompt.trim();

  const client = new Anthropic();
  const project = await prismaClient.project.findUnique({
    where: {
      id: projectId,
    },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const promptDb = await prismaClient.prompt.create({
    data: {
      content: prompt,
      projectId,
      promptType: "USER",
    },
  });

  const allPrompts = await prismaClient.prompt.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  let artifactProcessor = new ArtifactProcessor(
    "",
    (schema) => onSchema(schema),
    (summery) => onSummery(summery)
  );
  const message = allPrompts.map((p: any) => ({
    role: (p.promptType === "USER" ? "user" : "assistant") as "user" | "assistant",
    content: p.content,
  }))
  let response = await client.messages.create({
    messages: message,
    system: systemPrompt(),
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 2000,
  });

  // Concatenate all text content blocks from the response
  let artifact = "";
  if (response && Array.isArray(response.content)) {
    for (const block of response.content) {
      if (block.type === "text") {
        artifact += block.text + "\n";
      }
    }
  }
  artifact = artifact.trim();
  artifactProcessor.append(artifact);
  artifactProcessor.parse();

  await prismaClient.prompt.create({
    data: {
      content: artifact,
      projectId,
      promptType: "AGENT",
    },
  });
  onPromptEnd(promptDb.id);

  res.json({ response });
});

app.get("/prompts/:projectId", authMiddleware, async (req, res) => {
  const { projectId } = req.params;
  const prompts = await prismaClient.prompt.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  res.json(prompts);
});

app.post("/project/:projectId/schema", authMiddleware, async (req, res) => {
  const { projectId } = req.params;
  const { schema } = req.body;

  try {
    const updatedProject = await prismaClient.project.update({
      where: { id: projectId },
      data: { schema },
    });
    res.json(updatedProject);
  } catch (error) {
    console.error("Failed to update project schema:", error);
    res.status(500).json({ error: "Failed to update project schema" });
  }
});

app.listen(8080, () => {
  console.log("Server is running on port 8080");
});
