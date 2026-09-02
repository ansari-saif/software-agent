import useSWR from 'swr';
import axios from 'axios';
import { BACKEND_URL } from '../config';
import { useAuth } from '@clerk/nextjs';
import { Prompt } from '@/types/prompt';
import { authHeaders, requireAuthToken } from '@/lib/authToken';

export const usePrompts = (projectId: string) => {
  const { getToken } = useAuth();

  const fetcher = async (url: string) => {
    const token = await requireAuthToken(getToken, { silent: true });
    if (!token) throw new Error('Please sign in to continue');
    const response = await axios.get<Prompt[]>(url, {
      headers: authHeaders(token),
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
