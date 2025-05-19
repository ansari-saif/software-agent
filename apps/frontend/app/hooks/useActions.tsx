import { BACKEND_URL } from "@/config";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { useEffect, useState } from "react";

interface Action {
  id: string;
  content: string;
  createdAt: Date;
}
export const useActions = (projectId: string) => {
  const [actions, setActions] = useState<Action[]>([]);
  const { getToken } = useAuth();
  useEffect(() => {
    const fetchActions = async () => {
      const token = await getToken();
      const response = await axios.get(`${BACKEND_URL}/actions/${projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setActions(response.data);
    };
    fetchActions();
    const interval = setInterval(() => {
      fetchActions();
    }, 500);
    return () => clearInterval(interval);
  }, []);
  return { actions };
};
