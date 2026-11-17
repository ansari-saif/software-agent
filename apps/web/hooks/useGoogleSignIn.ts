"use client";

import { useSignIn } from "@clerk/nextjs";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Starts Google through Clerk. This SDK completes the handshake on `/sso-callback`
 * (`redirectUrl`) and asks Google to show the account picker.
 */
export function useGoogleSignIn() {
  const { signIn } = useSignIn();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (!signIn || busy) return;
    setBusy(true);
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/",
        oidcPrompt: "select_account",
      });
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    }
  };

  return { start, busy, ready: Boolean(signIn) };
}
