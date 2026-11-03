"use client";

import {
  CreateProjectWithRunResponseSchema,
  ProjectResponseSchema,
  type CreateProjectWithRunResponse,
  type PaginatedMessagesResponse,
  type ProjectResponse,
} from "@repo/contracts";
import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { messagesKey, projectKey, sandboxKey } from "@/hooks/keys";
import type { ComposerPayload } from "@/hooks/useMessages";
import { useApi, useSessionUser } from "@/hooks/useApi";
import { useInvalidateProjects } from "@/hooks/useProjects";
import { newIdempotencyKey } from "@/lib/api";

export function useCreateProject() {
  const api = useApi();
  const { userId } = useSessionUser();
  const { mutate } = useSWRConfig();
  const invalidateProjects = useInvalidateProjects();

  return useCallback(
    async ({ prompt, images }: ComposerPayload): Promise<CreateProjectWithRunResponse> => {
      const res = await api.request("/projects", {
        method: "POST",
        body: { prompt, images },
        schema: CreateProjectWithRunResponseSchema,
        idempotencyKey: newIdempotencyKey(),
      });
      // Seed the workspace caches so the project page renders immediately.
      const pKey = projectKey(userId, res.project.id);
      const mKey = messagesKey(userId, res.project.id);
      if (pKey) void mutate(pKey, res.project, { revalidate: false });
      if (mKey) {
        const seeded: PaginatedMessagesResponse = {
          items: [res.message],
          nextCursor: null,
          activeRun: { id: res.run.id, status: res.run.status },
        };
        void mutate(mKey, seeded, { revalidate: false });
      }
      void invalidateProjects();
      return res;
    },
    [api, invalidateProjects, mutate, userId]
  );
}

export function useProjectActions(projectId: string) {
  const api = useApi();
  const { userId } = useSessionUser();
  const { mutate } = useSWRConfig();
  const invalidateProjects = useInvalidateProjects();

  const update = useCallback(
    async (patch: { name?: string; instructions?: string | null }) => {
      const project = await api.request<ProjectResponse>(`/projects/${projectId}`, {
        method: "PATCH",
        body: patch,
        schema: ProjectResponseSchema,
      });
      const key = projectKey(userId, projectId);
      if (key) await mutate(key, project, { revalidate: false });
      void invalidateProjects();
      return project;
    },
    [api, invalidateProjects, mutate, projectId, userId]
  );

  const remove = useCallback(async () => {
    await api.request(`/projects/${projectId}`, { method: "DELETE" });
    for (const key of [projectKey, messagesKey, sandboxKey]) {
      const k = key(userId, projectId);
      if (k) void mutate(k, undefined, { revalidate: false });
    }
    await invalidateProjects();
  }, [api, invalidateProjects, mutate, projectId, userId]);

  const exportArchive = useCallback(
    (filename: string) => api.download(`/projects/${projectId}/export`, filename),
    [api, projectId]
  );

  const cancelRun = useCallback(
    (runId: string) => api.request(`/runs/${runId}/cancel`, { method: "POST" }),
    [api]
  );

  return { update, remove, exportArchive, cancelRun };
}
