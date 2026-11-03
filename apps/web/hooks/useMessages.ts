"use client";

import {
  PaginatedMessagesResponseSchema,
  SendMessageResponseSchema,
  type ImageBlock,
  type PaginatedMessagesResponse,
  type SendMessageResponse,
} from "@repo/contracts";
import { useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";
import { messagesKey } from "@/hooks/keys";
import { useApi, useSessionUser } from "@/hooks/useApi";
import { ApiError, newIdempotencyKey } from "@/lib/api";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export interface ComposerPayload {
  prompt: string;
  images: ImageBlock[];
}

export function useMessages(projectId: string) {
  const api = useApi();
  const { userId } = useSessionUser();
  return useSWR<PaginatedMessagesResponse>(messagesKey(userId, projectId), async () => {
    const items: PaginatedMessagesResponse["items"] = [];
    let cursor: string | null = null;
    let activeRun: PaginatedMessagesResponse["activeRun"] = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) qs.set("cursor", cursor);
      const res: PaginatedMessagesResponse = await api.request(
        `/projects/${projectId}/messages?${qs}`,
        { schema: PaginatedMessagesResponseSchema }
      );
      items.push(...res.items);
      activeRun = res.activeRun ?? null;
      cursor = res.nextCursor;
      if (!cursor) break;
    }
    return { items, nextCursor: cursor, activeRun };
  });
}

export function useSendMessage(projectId: string) {
  const api = useApi();
  const { userId } = useSessionUser();
  const { mutate } = useSWRConfig();

  return useCallback(
    async ({ prompt, images }: ComposerPayload): Promise<SendMessageResponse> => {
      const key = messagesKey(userId, projectId);
      if (!key) throw new ApiError({ status: 401, code: "UNAUTHORIZED", message: "Not signed in" });

      const request = api.request(`/projects/${projectId}/messages`, {
        method: "POST",
        body: { prompt, images },
        schema: SendMessageResponseSchema,
        idempotencyKey: newIdempotencyKey(),
      });

      let result: SendMessageResponse | undefined;
      try {
        await mutate<PaginatedMessagesResponse, SendMessageResponse>(key, request, {
          optimisticData: (current) => ({
            items: [
              ...(current?.items ?? []),
              {
                id: `optimistic-${crypto.randomUUID()}`,
                projectId,
                runId: null,
                role: "USER",
                content: [
                  ...images,
                  ...(prompt ? [{ type: "text" as const, text: prompt }] : []),
                ],
                createdAt: new Date().toISOString(),
              },
            ],
            nextCursor: current?.nextCursor ?? null,
            activeRun: current?.activeRun ?? null,
          }),
          populateCache: (res, current) => {
            result = res;
            return {
              items: [...(current?.items ?? []), res.message],
              nextCursor: current?.nextCursor ?? null,
              activeRun: { id: res.run.id, status: res.run.status },
            };
          },
          rollbackOnError: true,
          revalidate: false,
        });
      } catch (err) {
        if (err instanceof ApiError && err.code === "CONFLICT") void mutate(key);
        throw err;
      }
      if (!result) throw new ApiError({ status: 0, code: "INVALID_RESPONSE", message: "No response" });
      return result;
    },
    [api, mutate, projectId, userId]
  );
}
