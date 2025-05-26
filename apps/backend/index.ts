import { prismaClient } from "db/client";
import express from "express";
import cors from "cors";
import { authMiddleware } from "./middleware";

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

app.post("/prompt", authMiddleware, async (req, res) => {
  const { projectId, prompt } = req.body;
  const userId = req.userId!;
  await prismaClient.prompt.create({
    data: {
      projectId,
      content: prompt,
      userId,
    },
  });
  res.json({});
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
