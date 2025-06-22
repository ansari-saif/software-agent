import axios from 'axios';
import { BACKEND_URL } from '../config';
import { useAuth } from '@clerk/nextjs';
import { useState } from 'react';

interface DbmlResponse {
  dbml_id: string;
  content: string;
  url: string;
  dbml_diagram_id?: string;
}

export function useGenerateDbml(projectId: string) {
  const { getToken } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbmlData, setDbmlData] = useState<DbmlResponse | null>(null);

  const generateDbml = async (): Promise<DbmlResponse> => {
    setIsGenerating(true);
    setError(null);
    
    try {
      const token = await getToken();
      const response = await axios.post<DbmlResponse>(
        `${BACKEND_URL}/project/${projectId}/generate-dbml`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const newData = response.data;
      setDbmlData(newData);
      return newData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate DBML';
      setError(errorMessage);
      console.error('Error generating DBML:', error);
      throw new Error(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const reset = () => {
    setError(null);
    setDbmlData(null);
  };

  return {
    generateDbml,
    isGenerating,
    error,
    dbmlData,
    isSuccess: !!dbmlData && !error,
    reset,
  };
} 