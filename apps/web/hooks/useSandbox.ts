"use client";

import { SandboxSessionResponseSchema, type SandboxSessionResponse } from "@repo/contracts";
import { useCallback } from "react";
import useSWR from "swr";
import { sandboxKey } from "@/hooks/keys";
import { useApi, useSessionUser } from "@/hooks/useApi";

const STARTING_POLL_MS = 3_000;
const MIN_REFRESH_MS = 30_000;
const REFRESH_BEFORE_EXPIRY_MS = 60_000;

/**
 * Ensures a sandbox session (signed IDE/preview URLs) only while `enabled`,
 * refreshing shortly before the signed URLs expire.
 */
export function useSandbox(projectId: string, enabled: boolean) {
  const api = useApi();
  const { userId } = useSessionUser();

  const swr = useSWR<SandboxSessionResponse>(
    enabled ? sandboxKey(userId, projectId) : null,
    () =>
      api.request(`/projects/${projectId}/sandbox`, {
        method: "POST",
        schema: SandboxSessionResponseSchema,
      }),
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      refreshInterval: (data) => {
        if (!data) return 0;
        if (data.status === "STARTING") return STARTING_POLL_MS;
        if (data.status !== "RUNNING") return 0;
        const expires = new Date(data.expiresAt).getTime() - Date.now();
        return Math.max(MIN_REFRESH_MS, expires - REFRESH_BEFORE_EXPIRY_MS);
      },
    }
  );

  const stop = useCallback(async () => {
    await api.request(`/projects/${projectId}/sandbox`, { method: "DELETE" });
    await swr.mutate(undefined, { revalidate: false });
  }, [api, projectId, swr]);

  return {
    session: swr.data,
    error: swr.error as unknown,
    isLoading: swr.isLoading,
    refresh: () => swr.mutate(),
    stop,
  };
}
