import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from '@clerk/nextjs';
import { BACKEND_URL } from '../config';

export function useGenerateBackend(projectId: string) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { getToken } = useAuth();

  const generateBackend = async () => {
    setIsGenerating(true);
    try {
      const token = await getToken();
      const response = await fetch(`${BACKEND_URL}/generate-backend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
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