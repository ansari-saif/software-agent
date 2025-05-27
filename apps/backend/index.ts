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
  let artifact = "";

  let response = client.messages
    .stream({
      messages: allPrompts.map((p: any) => ({
        role: p.type === "USER" ? "user" : "assistant",
        content: p.content,
      })),
      system: systemPrompt(),
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 8000,
    })
    .on("text", (text) => {
      artifactProcessor.append(text);
      artifactProcessor.parse();
      artifact += text;
    })
    .on("finalMessage", async (message) => {
      console.log("done!");
      await prismaClient.prompt.create({
        data: {
          content: artifact,
          projectId,
          promptType: "AGENT",
        },
      });
      onPromptEnd(promptDb.id);
    })
    .on("error", (error) => {
      console.log("error", error);
    });

  res.json({ response });
});

app.get("/prompts/:projectId", authMiddleware, async (req, res) => {
  const { projectId } = req.params;
  const prompts = await prismaClient.prompt.findMany({
    where: { projectId },
  });
  res.json(prompts);
});

app.listen(8080, () => {
  console.log("Server is running on port 8080");
});
