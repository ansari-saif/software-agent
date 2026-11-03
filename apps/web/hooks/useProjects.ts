"use client";

import {
  PaginatedProjectsResponseSchema,
  ProjectResponseSchema,
  type PaginatedProjectsResponse,
  type ProjectResponse,
} from "@repo/contracts";
import { useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";
import useSWRInfinite, { unstable_serialize } from "swr/infinite";
import { projectKey, projectsPageKey } from "@/hooks/keys";
import { useApi, useSessionUser } from "@/hooks/useApi";

const PAGE_SIZE = 25;

export function useProjects() {
  const api = useApi();
  const { userId } = useSessionUser();
  const swr = useSWRInfinite<PaginatedProjectsResponse>(
    projectsPageKey(userId),
    ([, , cursor]: readonly [string, string, string | null]) => {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) qs.set("cursor", cursor);
      return api.request(`/projects?${qs}`, { schema: PaginatedProjectsResponseSchema });
    },
    { revalidateFirstPage: true }
  );

  const pages = swr.data ?? [];
  const projects = pages.flatMap((p) => p.items);
  const hasMore = pages.length > 0 && Boolean(pages[pages.length - 1]?.nextCursor);

  return {
    projects,
    error: swr.error as unknown,
    isLoading: swr.isLoading,
    isLoadingMore: swr.isValidating && swr.size > pages.length,
    hasMore,
    loadMore: () => swr.setSize(swr.size + 1),
    mutate: swr.mutate,
  };
}

/** Revalidates the project list from anywhere (e.g. after create/rename/delete). */
export function useInvalidateProjects() {
  const { mutate } = useSWRConfig();
  const { userId } = useSessionUser();
  return useCallback(() => {
    if (!userId) return Promise.resolve();
    return mutate(unstable_serialize(projectsPageKey(userId)));
  }, [mutate, userId]);
}

export function useProject(projectId: string, fallbackData?: ProjectResponse) {
  const api = useApi();
  const { userId } = useSessionUser();
  return useSWR<ProjectResponse>(
    projectKey(userId, projectId),
    () => api.request(`/projects/${projectId}`, { schema: ProjectResponseSchema }),
    { fallbackData }
  );
}
