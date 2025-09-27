import useSWR from 'swr';
import axios from 'axios';
import { BACKEND_URL } from '../config';
import { useAuth } from '@clerk/nextjs';
import { OptimisticPrompt } from '@/types/prompt';

export function useBackendActions(projectId: string) {
  const { getToken } = useAuth();

  const fetcher = async (url: string) => {
    const token = await getToken();
    const response = await axios.get<OptimisticPrompt[]>(url+"?type=BACKEND", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  };

  const { data, error, mutate, isLoading } = useSWR(
    `${BACKEND_URL}/actions/${projectId}`,
    fetcher,
    { refreshInterval: 500 }
  );

  return {
    actions: data,
    isLoading,
    error: error ? error.message : null,
    mutate,
  };
} 