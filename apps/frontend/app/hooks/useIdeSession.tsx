import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/app/config";
import { authHeaders, requireAuthToken } from "@/lib/authToken";

export type IdeKind = "backend" | "frontend";

type IdeSessionResponse = {
  sessionId: string;
  url: string;
  folder: string;
  previewUrl?: string;
  docsUrl?: string;
  kind: IdeKind;
};

export function useIdeSession(kind: IdeKind) {
  const { getToken } = useAuth();
  const [session, setSession] = useState<IdeSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const ensureSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = await requireAuthToken(getToken, { silent: true });
      if (!token) {
        setError("Please sign in to continue");
        return null;
      }
      const response = await fetch(`${BACKEND_URL}/ide/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token),
        },
        body: JSON.stringify({ kind }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          body.message || body.error || `IDE session failed (${response.status})`
        );
      }
      const data = (await response.json()) as IdeSessionResponse;
      setSession(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start IDE";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getToken, kind]);

  useEffect(() => {
    void ensureSession();
  }, [ensureSession]);

  return { session, error, isLoading, ensureSession };
}
