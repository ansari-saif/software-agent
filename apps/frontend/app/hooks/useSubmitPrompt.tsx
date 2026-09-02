import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '@clerk/nextjs';
import { BACKEND_URL } from '@/app/config';
import { authHeaders, requireAuthToken } from '@/lib/authToken';

type SubmitPromptResponse = {
  response: {
    content: Array<{ type: string; text: string }>;
  };
};

export const useSubmitPrompt = (projectId: string) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  const submitPrompt = async (
    promptContent: string,
    imageData?: { base64: string; mediaType: string; preview: string } | null
  ) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const token = await requireAuthToken(getToken);
      if (!token) throw new Error('Please sign in to continue');

      const response = await axios.post<SubmitPromptResponse>(
        `${BACKEND_URL}/prompt`,
        {
          projectId,
          prompt: promptContent,
        },
        { headers: authHeaders(token) }
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