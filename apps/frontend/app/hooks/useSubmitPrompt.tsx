import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '@clerk/nextjs';
import { BACKEND_URL } from '@/app/config';

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
        `${BACKEND_URL}/prompt`,
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