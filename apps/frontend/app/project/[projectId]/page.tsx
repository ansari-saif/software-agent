"use client";
import { BACKEND_URL } from "../../../config";
import Appbar from "@/components/Appbar";
import React from "react";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePrompts } from "@/app/hooks/usePrompts";
import axios from "axios";
import { useAuth } from "@clerk/nextjs";
export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = React.use(params);
  const { prompts } = usePrompts(projectId);
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
      <div className="flex h-[calc(100vh-64px)]">
        <div className="w-1/3 flex flex-col justify-between p-4">
          <div className="text-white text-2xl font-bold">Chat History</div>
          <div className="text-white flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-200px)]">
            {prompts.map((prompt) =>
              prompt.promptType === "USER" ? (
                <div key={prompt.id}>{prompt.content}</div>
              ) : (
                <div key={prompt.id}>{prompt.action}</div>
              )
            )}
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
                  `${BACKEND_URL}/prompt`,
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
        <div className="w-2/3 text-white bg-gray-800">
          <iframe src="https://dbdiagram.io/e/683ca3b3bd74709cb7907bee/683f28a061dc3bf08d6646ae" className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
