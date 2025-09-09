import { prismaClient } from "db/client";
// import { ProjectType } from "@prisma/client";
import { writeFiles } from "../backend/utils/fileWriter";
const BASE_WORKER_DIR = "/tmp/bolty-worker";

export async function onFileUpdate(
  filePath: string,
  fileContent: string,
  projectId: string,
  promptId: string,
  agentType: "backend" | "frontend" = "backend"
) {
  await writeFiles([{ file_path: filePath, file_content: fileContent }], projectId, agentType);
  console.log(`Updated file ${filePath}`);

  await prismaClient.action.create({
    data: {
      projectId,
      promptId,
      content: `Updated file ${filePath}`,
    },
  });
}

export async function onShellCommand(
  shellCommand: string,
  projectId: string,
  promptId: string,
  agentType: "backend" | "frontend" = "backend"
) {
  //npm run build && npm run start
  const commands = shellCommand.split("&&");
  for (const command of commands) {
    console.log(`Running command: ${command}`);
    `    `;
    // const result = Bun.spawnSync({
    //   cmd: ["sh", "-c", command],
    //   cwd: BASE_WORKER_DIR,
    // });
    await prismaClient.action.create({
      data: {
        projectId,
        promptId,
        content: `Ran command: ${command}`,
      },
    });
  }
}

export function onPromptEnd(promptId: string) {
  // on prompt end
}
