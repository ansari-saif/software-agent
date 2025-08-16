import express from "express";
import cors from "cors";
import { prismaClient } from "db/client";
import { Anthropic } from "@anthropic-ai/sdk";
import { authMiddleware } from "./middleware";
import { ArtifactProcessor } from "./parser";
import { onPromptEnd, onSchema, onSummery } from "./os";
import { systemPrompt } from "./systemPrompt";
import { DbmlGeneratorService } from "./services/dbmlGenerator";
import { OpenApiProcessor } from "./services/openApiProcessor";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { isModuleArray } from "./types/dbml";
import { runProjectCommand, writeFiles } from "./utils/fileWriter";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

if (!process.env.DBDIAGRAM_API_TOKEN) {
  throw new Error("DBDIAGRAM_API_TOKEN environment variable is required");
}

const DBDIAGRAM_API_TOKEN = process.env.DBDIAGRAM_API_TOKEN;
const createProject = async (req: any, res: any) => {
  const { prompt } = req.body;
  const userId = req.userId!;
  const description = prompt.split(" ").slice(0, 2).join(" ");
  const project = await prismaClient.project.create({
    data: { description, userId },
  });
  res.json({
    projectId: project.id,
  });
}
const getProjects = async (req: any, res: any) => {
  const userId = req.userId!;
  const projects = await prismaClient.project.findMany({
    where: { userId },
  });
  res.json(projects);
}
const getProjectDetails = async (req: any, res: any) => {
  const { projectId } = req.params;
  const userId = req.userId!;

  try {
    const project = await prismaClient.project.findUnique({
      where: {
        id: projectId,
      },
    });

    if (!project) {
      res.status(404).json({ error: "Project not found" });
    }

    // Optional: Add authorization check
    if (project?.userId !== userId) {
      res.status(403).json({ error: "Not authorized to access this project" });
    }

    res.json(project);
  } catch (error) {
    console.error("Failed to fetch project:", error);
    res.status(500).json({ error: "Failed to fetch project" });
  }
}
const setPrompt = async (req: any, res: any) => {
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
    role: (p.promptType === "USER" ? "user" : "assistant") as
      | "user"
      | "assistant",
    content: p.content,
  }));
  let response = await client.messages.create({
    messages: message,
    system: systemPrompt("db"),
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
};
const getPrompt = async (req: any, res: any) => {
  const { projectId } = req.params;
  const prompts = await prismaClient.prompt.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  res.json(prompts);
};
const getBackendPrompt = async (req: any, res: any) => {
  const { projectId } = req.params;
  const prompts = await prismaClient.backendPrompt.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  res.json(prompts);
};
const setBackendPrompt = async (req: any, res: any) => {
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
  const promptDb = await prismaClient.backendPrompt.create({
    data: {
      content: prompt,
      projectId,
      promptType: "USER",
    },
  });

  const allPrompts = await prismaClient.backendPrompt.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  let artifactProcessor = new ArtifactProcessor(
    "",
    (schema) => onSchema(schema),
    (summery) => onSummery(summery)
  );
  const message = allPrompts.map((p: any) => ({
    role: (p.promptType === "USER" ? "user" : "assistant") as
      | "user"
      | "assistant",
    content: p.content,
  }));
  let response = await client.messages.create({
    messages: message,
    system: systemPrompt("backend"),
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

  await prismaClient.backendPrompt.create({
    data: {
      content: artifact,
      projectId,
      promptType: "AGENT",
    },
  });
  onPromptEnd(promptDb.id);

  res.json({ response });
};
const generateBackend = async (req: any, res: any) => {
  let { projectId } = req.body;

  try {
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

    // Get the project's schema to generate backend
    const schema = project.schema as any[];
    if (!schema) {
      res
        .status(400)
        .json({ error: "Project schema is required for backend generation" });
      return;
    }

    for (let index = 0; index < schema.length; index++) {
      const element = JSON.stringify(schema[index]);

      // Create initial prompt for backend generation
      const initialPrompt = `Generate a complete backend implementation based on this schema: ${element}`;

      const promptDb = await prismaClient.backendPrompt.create({
        data: {
          content: initialPrompt,
          projectId,
          promptType: "USER",
        },
      });

      const allPrompts = await prismaClient.backendPrompt.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      });

      const message = allPrompts
        .filter((p: any) => p.content && p.content.trim().length > 0) // Filter out empty content
        .map((p: any) => ({
          role: (p.promptType === "USER" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: p.content.trim(),
        }));

      let response = await client.messages.create({
        messages: message,
        system: systemPrompt("backend"),
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 4000,
      });

      // Parse and process the AI response
      let files: Array<{ file_path: string; file_content: string }> = [];

      if (response && Array.isArray(response.content)) {
        for (const block of response.content) {
          if (block.type === "text") {
            try {
              // Try to parse the content as JSON
              const fileData = JSON.parse(block.text);
              files = [...files, ...fileData];
            } catch (e) {
              // If not JSON, append to the current response
              console.log("Non-JSON response block:", block.text);
            }
          }
        }
      }

      if (files.length === 0) {
        res.status(400).json({ error: "No files generated" });
        return;
      }
      // Write the files to disk
      if (files.length > 0) {
        await writeFiles(files, projectId);
      }

      // Store the complete response in the database
      const artifactContent = files
        .map((f) => `File: ${f.file_path}\n\n${f.file_content}\n\n---\n\n`)
        .join("");

      await prismaClient.backendPrompt.create({
        data: {
          content: artifactContent,
          projectId,
          promptType: "AGENT",
        },
      });

      onPromptEnd(promptDb.id);
    }

    await processOpenApiInternal(projectId);

    res.json({
      message: "Backend generated successfully",
      projectId,
    });
  } catch (error) {
    console.error("Error in backend generation:", error);
    res.status(500).json({
      error: "Failed to generate backend",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};


const getFrontendPrompt = async (req: any, res: any) => {
  const { projectId } = req.params;
  const prompts = await prismaClient.frontendPrompt.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  res.json(prompts);
};

const setFrontendPrompt = async (req: any, res: any) => {
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
  const promptDb = await prismaClient.frontendPrompt.create({
    data: {
      content: prompt,
      projectId,
      promptType: "USER",
    },
  });

  const allPrompts = await prismaClient.frontendPrompt.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  let artifactProcessor = new ArtifactProcessor(
    "",
    (schema) => onSchema(schema),
    (summery) => onSummery(summery)
  );
  const message = allPrompts.map((p: any) => ({
    role: (p.promptType === "USER" ? "user" : "assistant") as
      | "user"
      | "assistant",
    content: p.content,
  }));
  let response = await client.messages.create({
    messages: message,
    system: systemPrompt("frontend"),
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

  await prismaClient.frontendPrompt.create({
    data: {
      content: artifact,
      projectId,
      promptType: "AGENT",
    },
  });
  onPromptEnd(promptDb.id);

  res.json({ response });
};

const generateFrontend = async (req: any, res: any) => {
  let { projectId } = req.body;

  try {
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

    // Get the project's schema to generate frontend
    const schema = project.schema as any[];
    if (!schema) {
      res
        .status(400)
        .json({ error: "Project schema is required for frontend generation" });
      return;
    }

    for (let index = 0; index < schema.length; index++) {
      const element = JSON.stringify(schema[index]);

      // Create initial prompt for frontend generation
      const initialPrompt = `Generate a complete frontend implementation based on this schema: ${element}`;

      const promptDb = await prismaClient.frontendPrompt.create({
        data: {
          content: initialPrompt,
          projectId,
          promptType: "USER",
        },
      });

      const allPrompts = await prismaClient.frontendPrompt.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      });

      const message = allPrompts
        .filter((p: any) => p.content && p.content.trim().length > 0) // Filter out empty content
        .map((p: any) => ({
          role: (p.promptType === "USER" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: p.content.trim(),
        }));

      let response = await client.messages.create({
        messages: message,
        system: systemPrompt("frontend"),
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 4000,
      });

      // Parse and process the AI response
      let files: Array<{ file_path: string; file_content: string }> = [];

      if (response && Array.isArray(response.content)) {
        for (const block of response.content) {
          if (block.type === "text") {
            try {
              // Try to parse the content as JSON
              const fileData = JSON.parse(block.text);
              files = [...files, ...fileData];
            } catch (e) {
              // If not JSON, append to the current response
              console.log("Non-JSON response block:", block.text);
            }
          }
        }
      }

      if (files.length === 0) {
        res.status(400).json({ error: "No files generated" });
        return;
      }
      // Write the files to disk
      if (files.length > 0) {
        await writeFiles(files, projectId, "frontend");
      }

      // Store the complete response in the database
      const artifactContent = files
        .map((f) => `File: ${f.file_path}\n\n${f.file_content}\n\n---\n\n`)
        .join("");

      await prismaClient.frontendPrompt.create({
        data: {
          content: artifactContent,
          projectId,
          promptType: "AGENT",
        },
      });

      onPromptEnd(promptDb.id);
    }
    res.json({
      message: "Frontend generated successfully",
      projectId,
    });
  } catch (error) {
    console.error("Error in frontend generation:", error);
    res.status(500).json({
      error: "Failed to generate frontend",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const projectSchema = async (req: any, res: any) => {
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
}
const generateDbml = async (req: any, res: any) => {
  const { projectId } = req.params;

  try {
    // Get project details
    const project = await prismaClient.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!project.schema) {
      res.status(404).json({ error: "Project schema not found" });
      return;
    }

    // Validate schema structure
    if (!isModuleArray(project.schema)) {
      res.status(400).json({ error: "Invalid schema format" });
      return;
    }

    // Generate DBML from schema
    const dbmlContent = DbmlGeneratorService.generateDbml(project.schema);

    // Prepare request headers
    const headers = {
      "dbdiagram-access-token": DBDIAGRAM_API_TOKEN,
      "Content-Type": "application/json",
    };

    let response;
    let isCreated = false;
    if (project.dbml_id) {
      // Update existing diagram
      response = await fetch(
        `https://api.dbdiagram.io/v1/diagrams/${project.dbml_id}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            name: project.description || "Untitled ER Diagram",
            content: dbmlContent,
          }),
        }
      );
    } else {
      isCreated = true;
      // Create new diagram
      response = await fetch("https://api.dbdiagram.io/v1/diagrams", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: project.description || "Untitled ER Diagram",
          content: dbmlContent,
        }),
      });
    }

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Invalid JSON response: ${responseText}`);
    }

    if (!response.ok) {
      throw new Error(
        `Failed to ${project.dbml_id ? "update" : "create"} diagram: ${responseText}`
      );
    }

    // Update project with dbml_id if it's a new diagram
    const dbml_id = data.id;
    if (!project.dbml_id) {
      await prismaClient.project.update({
        where: { id: projectId },
        data: { dbml_id: data.id },
      });
    }

    // Update project schema
    await prismaClient.project.update({
      where: { id: projectId },
      data: { schema: project.schema },
    });

    let responseJson;
    if (isCreated) {
      response = await fetch(
        `https://api.dbdiagram.io/v1/embed_link/${dbml_id}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            detailLevel: "All",
            darkMode: "true",
            highlight: "true",
            enabled: "true",
          }),
        }
      );
      responseJson = await response.json();
      await prismaClient.project.update({
        where: { id: projectId },
        data: { dbml_diagram_id: responseJson._id },
      });
    }

    res.json({
      dbml_id: project.dbml_id || data.id,
      dbml_diagram_id: responseJson?._id,
      content: dbmlContent,
      url: `https://dbdiagram.io/d/${project.dbml_id || data.id}`,
      ...data,
    });
  } catch (error) {
    console.error("Error generating DBML:", error);
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate DBML diagram",
    });
  }
}

const processOpenApiInternal = async (projectId: string) => {
  try {
    // Get project details
    const project = await prismaClient.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      console.error("Project not found");
      return;
    }

    // Get OpenAPI data from project
    const openApiData = project.openApi;
    if (!openApiData) {
      console.error("OpenAPI data not found for this project");
      return;
    }

    // Initialize OpenAPI structure if it doesn't exist
    let openApiStructure = openApiData as any;
    if (!OpenApiProcessor.isValidOpenApiStructure(openApiStructure)) {
      openApiStructure = OpenApiProcessor.initializeOpenApiStructure(
        project.description || "API"
      );
    }

    // Get schema data from project
    const schemaData = project.schema;
    if (!schemaData) {
      console.error("Project schema is required for OpenAPI processing");
      return;
    }

    // Process the OpenAPI data using the service
    const processedOpenApi = OpenApiProcessor.processOpenApiData(
      schemaData as any,
      openApiStructure
    );

    // Store the processed OpenAPI data back to the project
    await prismaClient.project.update({
      where: { id: projectId },
      data: { openApi: processedOpenApi as any },
    });

    // Write the files to disk
    if (processedOpenApi) {
      await writeFiles(
        [
          {
            file_path: "openapi.json",
            file_content: JSON.stringify(processedOpenApi),
          },
        ],
        projectId,
        "frontend"
      );
      await runProjectCommand("npm run generate-client", projectId, "frontend");
    }
  } catch (error) {
    console.error("Error processing OpenAPI data:", error);
  }
};

const processOpenApi = async (req: any, res: any) => {
  const { projectId } = req.params;

  try {
    processOpenApiInternal(projectId);

    res.json({
      message: "OpenAPI data processed and stored successfully",
      projectId,
    });
  } catch (error) {
    console.error("Error processing OpenAPI data:", error);
    res.status(500).json({
      error: "Failed to process OpenAPI data",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
app.post("/project", authMiddleware, createProject);
app.post("/projects", authMiddleware, getProjects);
app.post("/prompt", authMiddleware, setPrompt);
app.get("/prompts/:projectId", authMiddleware, getPrompt);
app.post("/backend-prompt", authMiddleware, setBackendPrompt);
app.post("/generate-backend", authMiddleware, generateBackend);
app.get("/backend-prompts/:projectId", authMiddleware, getBackendPrompt);
app.post("/frontend-prompt", authMiddleware, setFrontendPrompt);
app.get("/frontend-prompts/:projectId", authMiddleware, getFrontendPrompt);
app.get("/project/:projectId", authMiddleware, getProjectDetails);
app.post("/project/:projectId/schema", authMiddleware, projectSchema);
app.post("/project/:projectId/generate-dbml", generateDbml);

// FIXME : ADD AUTH
app.post("/project/:projectId/process-openapi", processOpenApi);
// FIXME : ADD AUTH
app.post("/generate-frontend", generateFrontend);
app.listen(8080, () => {
  console.log("Server is rurnning on port 8080");
});
