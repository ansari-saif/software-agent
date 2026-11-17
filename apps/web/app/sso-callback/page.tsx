import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function SsoCallbackPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-atmosphere">
      <AuthenticateWithRedirectCallback signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" />
      <p className="text-sm text-muted-foreground">Signing in…</p>
    </div>
  );
}
