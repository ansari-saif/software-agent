import { BACKEND_URL } from "@/config";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { useEffect, useState } from "react";

type PromptType = 'USER' | 'AGENT';

interface Prompt {
  id: string;
  content: string;
  projectId: string;
  userId: string;
  promptType: PromptType;
  action?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const usePrompts = (projectId: string) => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const { getToken } = useAuth();
  useEffect(() => {
    const fetchPrompts = async () => {
      const token = await getToken();
      const response = await axios.get(`${BACKEND_URL}/prompts/${projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setPrompts(response.data);
    };
    fetchPrompts();
    const interval = setInterval(() => {
      fetchPrompts();
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  return { prompts, setPrompts };
};
