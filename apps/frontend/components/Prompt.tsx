"use client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth, useClerk } from "@clerk/nextjs";
import axios from "axios";
import { Send } from "lucide-react";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "../config";
import { SpiralAnimation } from "@/components/ui/spiral-animation";
import { authHeaders, requireAuthToken } from "@/lib/authToken";
import { toast } from "sonner";

const Prompt = () => {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { getToken, isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const router = useRouter();

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }

    try {
      setIsLoading(true);
      const token = await requireAuthToken(getToken);
      if (!token) {
        openSignIn?.({ fallbackRedirectUrl: "/" });
        setIsLoading(false);
        return;
      }

      const response = await axios.post(
        `${BACKEND_URL}/project`,
        { prompt },
        { headers: authHeaders(token) }
      );
      setPrompt("");
      await axios.post(
        `${BACKEND_URL}/prompt`,
        {
          projectId: response.data.projectId,
          prompt,
        },
        { headers: authHeaders(token) }
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));
      router.push(`/project/${response.data.projectId}`);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to create project");
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
      {!isSignedIn && (
        <p className="mb-2 text-sm text-amber-400">
          Sign in to generate a project.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => openSignIn?.({ fallbackRedirectUrl: "/" })}
          >
            Sign in
          </button>
        </p>
      )}
      <Textarea
        className="bg-gray-900 text-white"
        placeholder="Create a inventory management application ..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit();
          }
        }}
      />
      <div className="flex justify-end p-2">
        <Button onClick={() => void handleSubmit()} disabled={isLoading}>
          <Send />
        </Button>
      </div>
    </div>
  );
};

export default Prompt;
