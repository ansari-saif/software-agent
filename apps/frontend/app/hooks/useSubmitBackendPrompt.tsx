import { useState } from "react";
import axios from "axios";
import { BACKEND_URL } from "../config";
import { useAuth } from "@clerk/nextjs";
import { OptimisticPrompt } from "@/types/prompt";

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
      const token = await getToken();
      const response = await axios.post<OptimisticPrompt>(
        `${BACKEND_URL}/backend-prompt`,
        {
          projectId,
          prompt: content,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
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
