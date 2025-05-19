"use client";
import { BACKEND_URL, WORKER_API_URL, WORKER_URL } from "@/config";
import Appbar from "@/components/Appbar";
import React from "react";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePrompts } from "@/app/hooks/usePrompts";
import { useActions } from "@/app/hooks/useActions";
import axios from "axios";
import { useAuth } from "@clerk/nextjs";
export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = React.use(params);
  const { prompts } = usePrompts(projectId);
  const { actions } = useActions(projectId);
  const [mounted, setMounted] = React.useState(false);
  const { getToken } = useAuth();
  const [prompt, setPrompt] = React.useState("");
  React.useEffect(() => setMounted(true), []);
  if (!mounted) {
    return null; // or <div>Loading...</div> if you prefer
  }
  return (
    <div className="bg-[rgb(10,10,10)]">
      <Appbar />
      <div className="flex h-screen">
        <div className="w-1/4 h-screen flex flex-col justify-between p-4">
          <div className="text-white text-2xl font-bold">Chat History</div>
          <div className="text-white flex flex-col gap-2">
            {prompts
              .filter((prompt) => prompt.type === "USER")
              .map((prompt) => (
                <div key={prompt.id}>{prompt.content}</div>
              ))}
            {actions.map((action) => (
              <div key={action.id}>{action.content}</div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              style={{ backgroundColor: "rgb(20,20,20)", color: "white" }}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <Button
              onClick={async () => {
                const token = await getToken();
                await axios.post(
                  `${WORKER_API_URL}/prompt`,
                  {
                    projectId: projectId,
                    prompt: prompt,
                  },
                  {
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                  }
                );
                setPrompt("");
              }}
            >
              <Send />
            </Button>
          </div>
        </div>
        <div className="w-3/4">
          <iframe src={WORKER_URL} width={"100%"} height={"100%"} />
        </div>
      </div>
    </div>
  );
}
