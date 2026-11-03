"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { createApiClient, type ApiClient } from "@/lib/api";

/** Single API client bound to the current Clerk session. */
export function useApi(): ApiClient {
  const { getToken } = useAuth();
  const clerk = useClerk();
  const redirecting = useRef(false);

  return useMemo(
    () =>
      createApiClient(
        () => getToken(),
        () => {
          if (redirecting.current) return;
          redirecting.current = true;
          toast.error("Your session has expired. Please sign in again.");
          void clerk.redirectToSignIn({ signInForceRedirectUrl: window.location.href });
        }
      ),
    [getToken, clerk]
  );
}

/** Auth state used to scope SWR keys; `userId` is null until Clerk has loaded a signed-in user. */
export function useSessionUser(): { isLoaded: boolean; userId: string | null } {
  const { isLoaded, isSignedIn, userId } = useAuth();
  return { isLoaded, userId: isLoaded && isSignedIn && userId ? userId : null };
}
