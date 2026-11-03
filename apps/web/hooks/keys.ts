import type { PaginatedProjectsResponse } from "@repo/contracts";

export const projectKey = (userId: string | null, projectId: string) =>
  userId ? (["project", userId, projectId] as const) : null;

export const messagesKey = (userId: string | null, projectId: string) =>
  userId ? (["messages", userId, projectId] as const) : null;

export const sandboxKey = (userId: string | null, projectId: string) =>
  userId ? (["sandbox", userId, projectId] as const) : null;

export const projectsPageKey =
  (userId: string | null) =>
  (index: number, previous: PaginatedProjectsResponse | null) => {
    if (!userId) return null;
    if (previous && !previous.nextCursor) return null;
    return ["projects", userId, index === 0 ? null : (previous?.nextCursor ?? null)] as const;
  };
