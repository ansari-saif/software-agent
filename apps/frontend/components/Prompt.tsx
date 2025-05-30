"use client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { Send } from "lucide-react";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "../config";
const Prompt = () => {
  const [prompt, setPrompt] = useState("");
  const { getToken } = useAuth();
  const router = useRouter();
  const handleSubmit = async () => {
    const token = await getToken();
    const response = await axios.post(`${BACKEND_URL}/project`, {
      prompt: prompt,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
    );
    console.log(response.data);
    setPrompt("");
    await axios.post(`${BACKEND_URL}/prompt`, {
      projectId: response.data.projectId,
      prompt: prompt,
    },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    router.push(`/project/${response.data.projectId}`);
  };

  return (
    <div>
      <Textarea
        className="bg-gray-900 text-white"
        placeholder="Create a chess application ..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <div className="flex justify-end p-2">
        <Button
          onClick={handleSubmit}
        >
          <Send />
        </Button>
      </div>
    </div>
  );
};

export default Prompt;
