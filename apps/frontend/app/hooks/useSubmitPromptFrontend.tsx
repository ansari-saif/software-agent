import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '@clerk/nextjs';
import { WORKER_URL } from '@/app/config';
import { authHeaders, requireAuthToken } from '@/lib/authToken';

type SubmitPromptResponse = {
  response: {
    content: Array<{ type: string; text: string }>;
  };
};

export const useSubmitPromptFrontend = (projectId: string) => {
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

      const requestBody: {
        projectId: string;
        prompt: string;
        imageData?: { base64: string; mediaType: string };
      } = {
        projectId,
        prompt: promptContent,
      };

      if (imageData) {
        requestBody.imageData = {
          base64: imageData.base64,
          mediaType: imageData.mediaType,
        };
      }

      const response = await axios.post<SubmitPromptResponse>(
        `${WORKER_URL}/prompt-frontend`,
        requestBody,
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
