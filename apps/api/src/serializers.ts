import {
  ContentBlockSchema,
  type MessageResponse,
  type ProjectResponse,
  type RunResponse,
} from "@repo/contracts";
import type { Message, Project, Run } from "db";
import { z } from "zod";

const ContentArray = z.array(ContentBlockSchema);

export function toProjectResponse(p: Project): ProjectResponse {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    instructions: p.instructions,
    previewPort: p.previewPort,
    previewPath: p.previewPath,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toMessageResponse(m: Message): MessageResponse {
  const parsed = ContentArray.safeParse(m.content);
  return {
    id: m.id,
    projectId: m.projectId,
    runId: m.runId,
    role: m.role,
    content: parsed.success ? parsed.data : [],
    createdAt: m.createdAt.toISOString(),
  };
}

export function toRunResponse(r: Run): RunResponse {
  return {
    id: r.id,
    projectId: r.projectId,
    status: r.status,
    error: r.error,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costMicros: r.costMicros,
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}
