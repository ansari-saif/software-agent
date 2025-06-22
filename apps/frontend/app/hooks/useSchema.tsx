import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '@clerk/nextjs';
import { BACKEND_URL } from '@/app/config';
import { Schema } from '@/types/schema';

export const useSchema = (projectId: string) => {
  const [schemaData, setSchemaData] = useState<Schema | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  const updateSchema = async (schema: Schema) => {
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      await axios.post(
        `${BACKEND_URL}/project/${projectId}/schema`,
        { schema },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setSchemaData(schema);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update schema';
      setError(errorMessage);
      console.error('Failed to update project schema:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const parseAndUpdateSchema = (content: string) => {
    if (content && content.includes("[") && content.includes("]")) {
      try {
        const startIdx = content.indexOf("[");
        const endIdx = content.lastIndexOf("]") + 1;
        const jsonString = content.substring(startIdx, endIdx);
        const parsedData = JSON.parse(jsonString);
        
        if (
          Array.isArray(parsedData) &&
          parsedData.length > 0 &&
          parsedData[0].module &&
          Array.isArray(parsedData[0].fields)
        ) {
          updateSchema(parsedData);
          return true;
        }
      } catch (error) {
        console.warn("Failed to parse schema:", error);
      }
    }
    return false;
  };

  return {
    schemaData,
    isLoading,
    error,
    updateSchema,
    parseAndUpdateSchema
  };
}; 