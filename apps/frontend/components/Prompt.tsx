"use client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { Send } from "lucide-react";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "../config";
import { SpiralAnimation } from "@/components/ui/spiral-animation";

const Prompt = () => {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { getToken } = useAuth();
  const router = useRouter();

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
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
      
      // Wait for a short delay to show the animation
      await new Promise(resolve => setTimeout(resolve, 1000));
      router.push(`/project/${response.data.projectId}`);
    } catch (error) {
      console.error('Error:', error);
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50">
        <SpiralAnimation 
          totalDots={800} 
          dotColor="#fff" 
          backgroundColor="#000"
          duration={2}
        />
      </div>
    );
  }

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
          disabled={isLoading}
        >
          <Send />
        </Button>
      </div>
    </div>
  );
};

export default Prompt;
