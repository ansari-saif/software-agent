import useSWR from 'swr';
import axios from 'axios';
import { BACKEND_URL } from '../config';
import { useAuth } from '@clerk/nextjs';
import { OptimisticPrompt } from '@/types/prompt';

export function useBackendPrompts(projectId: string) {
  const { getToken } = useAuth();

  const fetcher = async (url: string) => {
    const token = await getToken();
    const response = await axios.get<OptimisticPrompt[]>(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  };

  const { data, error, mutate, isLoading } = useSWR(
    `${BACKEND_URL}/backend-prompts/${projectId}`,
    fetcher
  );

  return {
    prompts: data,
    isLoading,
    error: error ? error.message : null,
    mutate,
  };
} 