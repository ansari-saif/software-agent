"use client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { Send } from "lucide-react";
import React, { useState } from "react";

const Prompt = () => {
  const [prompt, setPrompt] = useState("");
  const { getToken } = useAuth();
  return (
    <div>
      <Textarea
        className="bg-gray-900 text-white"
        placeholder="Create a chess application ..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="flex justify-end p-2">
        <Button

          onClick={async () => {
            const token = await getToken();
            const response = await axios.post("http://localhost:8080/project", {
              prompt: prompt,
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );
          console.log(response.data);
        }}
        >
          <Send />
        </Button>
      </div>
    </div>
  );
};

export default Prompt;
