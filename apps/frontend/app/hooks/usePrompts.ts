import { useState, useEffect, Dispatch, SetStateAction } from "react";
import axios from "axios";
import { BACKEND_URL } from "../config";
import { useAuth } from "@clerk/nextjs";

export interface Prompt {
  id: string;
  content: string;
  promptType: string;
}

interface UsePromptsReturn {
  prompts: Prompt[];
  setPrompts: Dispatch<SetStateAction<Prompt[]>>;
  mutate: () => Promise<void>;
}

export function usePrompts(projectId: string): UsePromptsReturn {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const { getToken } = useAuth();

  const fetchPrompts = async () => {
    const token = await getToken();
    const response = await axios.get(`${BACKEND_URL}/prompt/${projectId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    setPrompts(response.data);
  };

  useEffect(() => {
    fetchPrompts();
  }, [projectId]);

  return {
    prompts,
    setPrompts,
    mutate: fetchPrompts
  };
} 