import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import { prismaClient } from "db/client";

import { ArtifactProcessor } from "./parser";
import { onFileUpdate, onPromptEnd, onShellCommand } from "./os";
import { systemPrompt } from "./systemPrompt";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.post("/generate-backend", async (req, res) => {
  const { projectId } = req.body;
  const project = await prismaClient.project.findUnique({
    where: {
      id: projectId,
    },
  });

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Get the project's schema to generate backend
  const schema = project.schema as any[];
  if (!schema) {
    res
      .status(400)
      .json({ error: "Project schema is required for backend generation" });
    return;
  }
  const client = new Anthropic();

  for (let index = 0; index < schema.length; index++) {
    const element = JSON.stringify(schema[index]);

    // Create initial prompt for backend generation
    const initialPrompt = `Generate a complete backend implementation based on this schema: ${element}`;
    
    const promptDb = await prismaClient.prompt.create({
      data: {
        content: initialPrompt,
        agentType: "BACKEND",
        projectId,
        promptType: "USER",
      },
    });
    console.log("promptDb.id", promptDb.id)
    await prismaClient.action.create({
      data: {
        content: initialPrompt,
        projectId,
        promptId: promptDb.id,
        promptType: "USER",
      },
    });
    const allPrompts = await prismaClient.prompt.findMany({
      where: { projectId, agentType: "BACKEND" },
      orderBy: { createdAt: "asc" },
    });
    let artifactProcessor = new ArtifactProcessor(
      "",
      (filePath, fileContent) =>
        onFileUpdate(filePath, fileContent, projectId, promptDb.id),
      (shellCommand) => onShellCommand(shellCommand, projectId, promptDb.id)
    );
    let artifact = "";
    const messages = allPrompts.map((p: any) => ({
      role: p.promptType === "USER" ? "user" : "assistant",
      content: p.content,
    })) as Array<{ role: "user" | "assistant"; content: string }>;
    let response = client.messages
      .stream({
        messages: messages,
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
             agentType: "BACKEND",
            content: artifact,
            projectId,
            promptType: "AGENT",
          },
        });

        await prismaClient.action.create({
          data: {
            content: "Done!",
            projectId,
            promptId: promptDb.id,
          },
        });
        onPromptEnd(promptDb.id);
      })
      .on("error", (error) => {
        console.log("error", error);
      });
  }
});

app.post("/prompt", async (req, res) => {
  const { prompt, projectId } = req.body;

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
       agentType: "BACKEND",
      content: prompt,
      projectId,
      promptType: "USER",
    },
  });
  await prismaClient.action.create({
    data: {
      content: prompt,
      projectId,
      promptId: promptDb.id,
      promptType: "USER",
    },
  });

  const allPrompts = await prismaClient.prompt.findMany({
    where: { projectId, agentType: "BACKEND" },
    orderBy: { createdAt: "asc" },
  });
  let artifactProcessor = new ArtifactProcessor(
    "",
    (filePath, fileContent) =>
      onFileUpdate(filePath, fileContent, projectId, promptDb.id),
    (shellCommand) => onShellCommand(shellCommand, projectId, promptDb.id)
  );
  let artifact = "";
  const messages = allPrompts.map((p: any) => ({
    role: p.promptType === "USER" ? "user" : "assistant",
    content: p.content,
  })) as Array<{ role: "user" | "assistant"; content: string }>;
  let response = client.messages
    .stream({
      messages: messages,
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
           agentType: "BACKEND",
          content: artifact,
          projectId,
          promptType: "AGENT",
        },
      });

      await prismaClient.action.create({
        data: {
          content: "Done!",
          projectId,
          promptId: promptDb.id,
        },
      });
      onPromptEnd(promptDb.id);
    })
    .on("error", (error) => {
      console.log("error", error);
    });

  res.json({ response });
});
app.listen(9091, () => {
  console.log("Server is running on port 9091");
});
