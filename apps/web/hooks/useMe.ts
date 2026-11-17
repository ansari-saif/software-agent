"use client";

import { MeResponseSchema, type MeResponse } from "@repo/contracts";
import useSWR from "swr";
import { useApi, useSessionUser } from "@/hooks/useApi";

export function useMe() {
  const api = useApi();
  const { userId } = useSessionUser();
  return useSWR<MeResponse>(userId ? (["me", userId] as const) : null, () =>
    api.request("/me", { schema: MeResponseSchema })
  );
}
