import { useState } from "react";
import axios from "axios";
import { WORKER_URL } from "@/app/config";
import { useAuth } from "@clerk/nextjs";
import { OptimisticPrompt } from "@/types/prompt";
import { authHeaders, requireAuthToken } from "@/lib/authToken";

export function useSubmitBackendPrompt(projectId: string) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  const submitPrompt = async (
    content: string
  ): Promise<OptimisticPrompt | null> => {
    setIsSubmitting(true);
    setError(null);

    try {
      const token = await requireAuthToken(getToken);
      if (!token) {
        setError("Please sign in to continue");
        return null;
      }
      const response = await axios.post<OptimisticPrompt>(
        `${WORKER_URL}/prompt`,
        {
          projectId,
          prompt: content,
        },
        { headers: authHeaders(token) }
      );

      return response.data;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setError(errorMessage);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    submitPrompt,
    isSubmitting,
    error,
  };
}
