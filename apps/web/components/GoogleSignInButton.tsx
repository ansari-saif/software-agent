"use client";

import { Button } from "@/components/ui/button";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";

export function GoogleSignInButton({
  label = "Continue with Google",
  size = "sm",
  variant = "default",
}: {
  label?: string;
  size?: "sm" | "default";
  variant?: "default" | "ghost";
}) {
  const { start, busy, ready } = useGoogleSignIn();
  return (
    <Button size={size} variant={variant} disabled={!ready || busy} onClick={() => void start()}>
      {label}
    </Button>
  );
}
