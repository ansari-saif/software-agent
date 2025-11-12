import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '@clerk/nextjs';

type SubmitPromptResponse = {
  response: {
    content: Array<{ type: string; text: string }>;
  };
};

export const useSubmitPrompt = (projectId: string) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  const submitPrompt = async (promptContent: string) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      const response = await axios.post<SubmitPromptResponse>(
        `http://localhost:9091/prompt-frontend`,
        {
          projectId,
          prompt: promptContent,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit prompt';
      setError(errorMessage);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    submitPrompt,
    isSubmitting,
    error,
  };
}; 