import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from '@clerk/nextjs';
import { WORKER_URL } from '@/app/config';
import { authHeaders, requireAuthToken } from '@/lib/authToken';

export function useGenerateBackend(projectId: string) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { getToken } = useAuth();

  const generateBackend = async () => {
    setIsGenerating(true);
    try {
      const token = await requireAuthToken(getToken);
      if (!token) return;
      const response = await fetch(`${WORKER_URL}/generate-backend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(token),
        },
        body: JSON.stringify({
          projectId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate backend');
      }

      const data = await response.json();
      toast.success('Backend generation started successfully');
      return data;
    } catch (error) {
      toast.error('Failed to generate backend', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    generateBackend,
    isGenerating,
  };
}
