import useSWR from 'swr';
import axios from 'axios';
import { useAuth } from '@clerk/nextjs';
import { BACKEND_URL } from '@/app/config';
import { Project } from '@/types/schema';

export const useProject = (projectId: string) => {
  const { getToken } = useAuth();

  const fetcher = async (url: string) => {
    const token = await getToken();
    const response = await axios.get<Project>(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  };

  const { data, error, mutate, isLoading } = useSWR(
    projectId ? `${BACKEND_URL}/project/${projectId}` : null,
    fetcher
  );

  return {
    project: data,
    isLoading,
    error,
    refetch: mutate,
  };
}; 