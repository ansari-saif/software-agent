import useSWR from 'swr';
import axios from 'axios';
import { BACKEND_URL } from '../config';
import { useAuth } from '@clerk/nextjs';
import { OptimisticPrompt } from '@/types/prompt';

export function useFrontendPrompts(projectId: string) {
  const { getToken } = useAuth();

  const fetcher = async (url: string) => {
    const token = await getToken();
    const response = await axios.get<OptimisticPrompt[]>(url+"?type=FRONTED", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  };

  const { data, error, mutate, isLoading } = useSWR(
    `${BACKEND_URL}/actions/${projectId}`,
    fetcher
  );

  return {
    prompts: data,
    isLoading,
    error: error ? error.message : null,
    mutate,
  };
} 