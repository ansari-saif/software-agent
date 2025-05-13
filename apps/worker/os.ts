import { prismaClient } from "db/client";
import { RelayWebsocket } from "./ws";
import { ProjectType } from "@prisma/client";

function getBaseWorkerDir(type:ProjectType) {
    if (type === "NEXTJS") {
        return "/tmp/next-app";
    }
    return "/tmp/mobile-app";
}


export async function onFileUpdate(filePath: string, fileContent: string, projectId: string, promptId: string, type:ProjectType) {
    await prismaClient.action.create({
        data: {
            projectId,
            promptId,
            content: `Updated file ${filePath}`
        },
    });

    RelayWebsocket.getInstance().send(JSON.stringify({
        event: "admin",
        data: {
            type: "update-file",
            content: fileContent,
            path: `${getBaseWorkerDir(type)}/${filePath}`
        }
    }))
}

export async function onShellCommand(shellCommand: string, projectId: string, promptId: string) {
    //npm run build && npm run start
    const commands = shellCommand.split("&&");
    for (const command of commands) {
        console.log(`Running command: ${command}`);

        RelayWebsocket.getInstance().send(JSON.stringify({
            event: "admin",
            data: {
                type: "command",
                content: command
            }
        }))

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
    RelayWebsocket.getInstance().send(JSON.stringify({
        event: "admin",
        data: {
            type: "prompt-end"
        }
    }))
}