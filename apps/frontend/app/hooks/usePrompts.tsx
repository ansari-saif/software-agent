import useSWR from 'swr';
import axios from 'axios';
import { BACKEND_URL } from '../config';
import { useAuth } from '@clerk/nextjs';
import { Prompt } from '@/types/prompt';

export const usePrompts = (projectId: string) => {
  const { getToken } = useAuth();

  const fetcher = async (url: string) => {
    const token = await getToken();
    const response = await axios.get<Prompt[]>(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  };

  const { data, error, mutate, isLoading } = useSWR(
    `${BACKEND_URL}/prompts/${projectId}`,
    fetcher
  );

  return {
    prompts: data,
    isLoading,
    error,
    mutate,
  };
};
