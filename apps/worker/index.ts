import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
// import { AnthropicSimulator as Anthropic } from "./anthropicSimulator";
import { prismaClient } from "db/client";

import { ArtifactProcessor } from "./parser";
import { onFileUpdate, onPromptEnd, onShellCommand } from "./os";
import { systemPrompt } from "./systemPrompt";
import { systemPrompt as systemPromptFrontend } from "./systemPromptFrontend";
import { systemPrompt as systemPromptDB } from "./systemDBPrompt";
import dotenv from "dotenv";
import { writeFiles } from "../backend/utils/fileWriter";
import { addModule } from "../backend/services/addModuleAst";

dotenv.config();
function toTitleCase(str: string) {
  return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

async function streamAnthropicResponse(
  client: Anthropic,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string,
  artifactProcessor: ArtifactProcessor,
  projectId: string,
  promptDbId: string,
  agentType: "BACKEND" | "FRONTEND" | "DB"
): Promise<void> {
  let artifact = "";
  
  return new Promise((resolve, reject) => {
    client.messages
      .stream({
        messages: messages,
        system: systemPrompt,
        model: "claude-3-7-sonnet-20250219",
        temperature: 0,
        max_tokens: 16000,
      })
      .on("text", (text: string) => {
        artifactProcessor.append(text);
        artifactProcessor.parse();
        artifact += text;
      })
      .on("finalMessage", async (message: any) => {
        console.log("done!");
        await prismaClient.prompt.create({
          data: {
            agentType,
            content: artifact,
            projectId,
            promptType: "AGENT",
          },
        });

        await prismaClient.action.create({
          data: {
            content: "Done!",
            projectId,
            promptId: promptDbId,
            agentType,
          },
        });
        onPromptEnd(promptDbId);
        resolve();
      })
      .on("error", (error: any) => {
        console.log("error", error);
        reject(error);
      });
  });
}

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
    let artifactProcessor = await new ArtifactProcessor(
      "",
      (filePath, fileContent) =>
        onFileUpdate(filePath, fileContent, projectId, promptDb.id),
      (shellCommand) => onShellCommand(shellCommand, projectId, promptDb.id)
    );
    const messages = allPrompts.map((p: any) => ({
      role: p.promptType === "USER" ? "user" : "assistant",
      content: p.content,
    })) as Array<{ role: "user" | "assistant"; content: string }>;
    
    await streamAnthropicResponse(
      client,
      messages,
      systemPrompt(),
      artifactProcessor,
      projectId,
      promptDb.id,
      "BACKEND"
    );
  }
  // Call OpenAPI processing endpoint
  try {
    const openApiResponse = await fetch(`http://localhost:8080/project/${projectId}/process-openapi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!openApiResponse.ok) {
      console.error('OpenAPI processing failed:', openApiResponse.statusText);
    } else {
      console.log('OpenAPI processing completed successfully');
    }
  } catch (error) {
    console.error('Error calling OpenAPI endpoint:', error);
  }
  
  res.json({ response: "success" });
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
      temperature: 0,
      max_tokens: 8000,
    })
    .on("text", (text: string) => {
      artifactProcessor.append(text);
      artifactProcessor.parse();
      artifact += text;
    })
    .on("finalMessage", async (message: any) => {
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
    .on("error", (error: any) => {
      console.log("error", error);
    });

  res.json({ response });
});

app.post("/generate-frontend", async (req, res) => {
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

  // Get the project's schema to generate FRONTEND
  const schema = project.schema as any[];
  if (!schema) {
    res
      .status(400)
      .json({ error: "Project schema is required for FRONTEND generation" });
    return;
  }
  const client = new Anthropic();

  for (let index = 0; index < schema.length; index++) {
    const moduleName = schema[index].module;
    const element = JSON.stringify(schema[index]);

    // Create initial prompt for FRONTEND generation
    const initialPrompt = `Generate a complete frontend implementation based on this schema: ${element}`;
    
    const promptDb = await prismaClient.prompt.create({
      data: {
        content: initialPrompt,
        agentType: "FRONTEND",
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
        agentType: "FRONTEND",
      },
    });
    const allPrompts = await prismaClient.prompt.findMany({
      where: { projectId, agentType: "FRONTEND" },
      orderBy: { createdAt: "asc" },
    });
    let artifactProcessor = new ArtifactProcessor(
      "",
      (filePath, fileContent) =>
        onFileUpdate(filePath, fileContent, projectId, promptDb.id, "frontend"),
      (shellCommand) => onShellCommand(shellCommand, projectId, promptDb.id, "frontend")
    );
    const messages = allPrompts.map((p: any) => ({
      role: p.promptType === "USER" ? "user" : "assistant",
      content: p.content,
    })) as Array<{ role: "user" | "assistant"; content: string }>;
    await streamAnthropicResponse(
      client,
      messages,
      systemPromptFrontend(),
      artifactProcessor,
      projectId,
      promptDb.id,
      "FRONTEND"
    );
    // Write the files to disk
    const routerPath = "src/App.tsx";
    const menuPath = "src/config/navigation.ts";
    if (project.routeCode && project.menuCode){
      let project = await prismaClient.project.findUnique({
        where: {
          id: projectId,
        },
      });
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const { router, menu } = addModule(project.routeCode, project.menuCode, './pages/'+toTitleCase(moduleName), toTitleCase(moduleName),'/' + moduleName.toLowerCase());
      await writeFiles([{ file_path: routerPath, file_content: router }, { file_path: menuPath, file_content: menu }], projectId, "frontend");
      await prismaClient.project.update({
        where: { id: projectId },
        data: { routeCode: router, menuCode: menu },
      });
    }else{
      console.error("Route or menu code not found");
    }
    
  }

  res.json({ response: "success" });
});
app.post("/prompt-frontend", async (req, res) => {
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
       agentType: "FRONTEND",
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
      agentType: "FRONTEND",

      promptType: "USER",
    },
  });

  const allPrompts = await prismaClient.prompt.findMany({
    where: { projectId, agentType: "FRONTEND" },
    orderBy: { createdAt: "asc" },
  });
  let artifactProcessor = new ArtifactProcessor(
    "",
    (filePath, fileContent) =>
      onFileUpdate(filePath, fileContent, projectId, promptDb.id, "frontend"),
    (shellCommand) => onShellCommand(shellCommand, projectId, promptDb.id, "frontend")
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
      temperature: 0,
      max_tokens: 8000,
    })
    .on("text", (text: string) => {
      artifactProcessor.append(text);
      artifactProcessor.parse();
      artifact += text;
    })
    .on("finalMessage", async (message: any) => {
      console.log("done!");
      await prismaClient.prompt.create({
        data: {
           agentType: "FRONTEND",
          content: artifact,
          projectId,
          promptType: "AGENT",
        },
      });

      await prismaClient.action.create({
        data: {
          content: "Done!",
          agentType: "FRONTEND",
          projectId,
          promptId: promptDb.id,
        },
      });
      onPromptEnd(promptDb.id);
    })
    .on("error", (error: any) => {
      console.log("error", error);
    });

  res.json({ response });
});

const setPromptdB = async (req: any, res: any) => {
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
      agentType: "DB",
    },
  });
  await prismaClient.action.create({
    data: {
      content: prompt,
      projectId,
      promptId: promptDb.id,
      agentType: "DB",

      promptType: "USER",
    },
  });

  const allPrompts = await prismaClient.prompt.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  let artifactProcessor = new ArtifactProcessor(
    "",
    (filePath, fileContent) => (void 0),
    (shellCommand) => (void 0)
  );
  let artifact = "";
  const messages = allPrompts.map((p: any) => ({
    role: p.promptType === "USER" ? "user" : "assistant",
    content: p.content,
  })) as Array<{ role: "user" | "assistant"; content: string }>;
  let response = client.messages
    .stream({
      messages: messages,
      system: systemPromptDB(),
      model: "claude-3-7-sonnet-20250219",
      temperature: 0,
      max_tokens: 8000,
    })
    .on("text", (text :string) => {
      artifactProcessor.append(text);
      artifactProcessor.parse();
      artifact += text;
    })
    .on("finalMessage", async (message :any) => {
      console.log("done!");
      await prismaClient.prompt.create({
        data: {
           agentType: "DB",
          content: artifact,
          projectId,
          promptType: "AGENT",
        },
      });

      await prismaClient.action.create({
        data: {
          content: "Done!",
          agentType: "DB",
          projectId,
          promptId: promptDb.id,
        },
      });
      onPromptEnd(promptDb.id);
    })
    .on("error", (error : any) => {
      console.log("error", error);
    });

  res.json({ response });
};
app.post("/prompt-db", setPromptdB);

app.listen(9091, () => {
  console.log("Server is running on port 9091");
});
