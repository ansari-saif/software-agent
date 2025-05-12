import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import { prismaClient } from "db/client";
import { RelayWebsocket } from "./wa";
import { ArtifactProcessor } from "./parser";
const app = express();
app.use(cors());
app.use(express.json());

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
      content: prompt,
      projectId,
      type: "USER",
    },
  });
  const { diff } = await RelayWebsocket.getInstance().sendAndAwaitResponse(
    {
      event: "admin",
      data: {
        type: "prompt-start",
      },
    },
    promptDb.id
  );
  if (diff){
    await prismaClient.prompt.create({
        data:{
            content:`<bolt-user-diff>${diff}</bolt-user-diff>\n\n${prompt}`,
            projectId,
            type: "USER",
        }
    })
  }
  const allPrompts = await prismaClient.prompt.findMany({
    where:{projectId},
    orderBy:{createdAt: "asc"},
  });
//   let artifactProcessor =  new ArtifactProcessor("", (filepath, filecontent) => onFileUpdate(filepath, filecontent, projectId, promptDb.id, project.type)))
});
