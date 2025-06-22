import { BACKEND_URL } from "@/config";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { useEffect, useState, useCallback } from "react";

export type PromptType = 'USER' | 'AGENT';

export interface Prompt {
  id: string;
  content: string;
  projectId: string;
  userId: string;
  promptType: PromptType;
  action?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface UsePromptsReturn {
  prompts: Prompt[];
  setPrompts: React.Dispatch<React.SetStateAction<Prompt[]>>;
  mutate: () => Promise<void>;
  isLoading: boolean;
}

export const usePrompts = (projectId: string): UsePromptsReturn => {
const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { getToken } = useAuth();

  const fetchPrompts = useCallback(async () => {
    try {
      setIsLoading(true);
      const token = await getToken();
      const response = await axios.get(`${BACKEND_URL}/prompts/${projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setPrompts(response.data);
    } catch (error) {
      console.error('Failed to fetch prompts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, getToken]);

  useEffect(() => {
    fetchPrompts();
    
    // Set up auto-refresh interval
    const interval = setInterval(() => {
      fetchPrompts();
    }, 1000);

    // Cleanup interval on unmount or when dependencies change
    return () => clearInterval(interval);
  }, [fetchPrompts]); // Only depend on fetchPrompts which has projectId and getToken in its deps

  return {
    prompts,
    setPrompts,
    mutate: fetchPrompts,
    isLoading
  };
};
