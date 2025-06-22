"use client";
import { BACKEND_URL } from "../../../config";
import Appbar from "@/components/Appbar";
import React from "react";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { usePrompts } from "@/app/hooks/usePrompts";
import axios from "axios";
import { useAuth } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import SchemaViewer from "@/components/SchemaViewer";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = React.use(params);
  const { prompts, mutate, isLoading: isLoadingPrompts } = usePrompts(projectId);
  const [mounted, setMounted] = React.useState(false);
  const { getToken } = useAuth();
  const [prompt, setPrompt] = React.useState("");
  const chatContainerRef = React.useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [optimisticPrompt, setOptimisticPrompt] = React.useState<{
    id: string;
    content: string;
    promptType: string;
  } | null>(null);
  const [schemaData, setSchemaData] = React.useState<Array<{
    module: string;
    fields: Array<{
      name: string;
      type?: string;
      ref?: string;
    }>;
  }> | null>(null);

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [optimisticPrompt]); // Only scroll when optimistic prompt changes, not on API updates

  const handleSubmit = async () => {
    if (!prompt.trim() || isSubmitting) return;

    const trimmedPrompt = prompt.trim();
    const tempId = Date.now().toString();
    setError(null);

    // Set optimistic prompt
    setOptimisticPrompt({
      id: tempId,
      content: trimmedPrompt,
      promptType: "USER",
    });

    // Clear input immediately
    setPrompt("");

    try {
      setIsSubmitting(true);
      const token = await getToken();
      const response = await axios.post(
        `${BACKEND_URL}/prompt`,
        {
          projectId: projectId,
          prompt: trimmedPrompt,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      // After successful submission, refresh the prompts list
      await mutate();

      // Check if response contains schema data
      if (
        response.data &&
        typeof response.data === "string" &&
        response.data.includes("[") &&
        response.data.includes("]")
      ) {
        try {
          // Extract JSON array from mixed text
          const startIdx = response.data.indexOf("[");
          const endIdx = response.data.lastIndexOf("]") + 1;
          const jsonString = response.data.substring(startIdx, endIdx);
          const parsedData = JSON.parse(jsonString);
          
          // Validate schema structure before setting
          if (
            Array.isArray(parsedData) &&
            parsedData.length > 0 &&
            parsedData[0].module &&
            Array.isArray(parsedData[0].fields)
          ) {
            setSchemaData(parsedData);
            console.log({schemaData});
          } else {
            console.warn("Invalid schema format received:", parsedData);
          }
        } catch (error) {
          // Only log parsing errors, don't report to error tracking
          console.warn("Failed to parse schema data:", error);
        }
      }
    } catch (error) {
      console.error("Failed to submit prompt:", error);
      setError(error instanceof Error ? error.message : "Failed to submit prompt");
      // On error, restore the failed message to input
      setPrompt(trimmedPrompt);
    } finally {
      setIsSubmitting(false);
      setOptimisticPrompt(null);
    }
  };

  React.useEffect(() => setMounted(true), []);
  if (!mounted) {
    return null;
  }

  // Only show optimistic prompt if it's not yet in the prompts array
  const optimisticPromptNotInList = optimisticPrompt && !prompts?.find(p => p.id === optimisticPrompt.id);
  const allPrompts = optimisticPromptNotInList
    ? [...(prompts || []), optimisticPrompt]
    : prompts;

  return (
    <div className="bg-[rgb(10,10,10)]">
      <Appbar />
      <div className="flex h-[calc(100vh-64px)]">
        <div className="w-1/3 flex flex-col justify-between p-4">
          <div className="text-white text-2xl font-bold">Chat History</div>
          <div
            ref={chatContainerRef}
            className="text-white flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-200px)]"
          >
            {isLoadingPrompts && !allPrompts?.length ? (
              <div className="flex justify-center items-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              allPrompts?.map((prompt) =>
                prompt.promptType === "USER" ? (
                  <div key={prompt.id} className="flex justify-end">
                    <div className="bg-gray-700 rounded-lg p-4 max-w-[80%]">
                      <div className="whitespace-pre-wrap">{prompt.content}</div>
                    </div>
                  </div>
                ) : (
                  (() => {
                    let parsedSchema = null;
                    let displayContent = prompt.content;

                    // First try to extract and parse any JSON schema data
                    if (prompt.content && prompt.content.includes("[") && prompt.content.includes("]")) {
                      const startIdx = prompt.content.indexOf("[");
                      const endIdx = prompt.content.lastIndexOf("]") + 1;
                      const jsonString = prompt.content.substring(startIdx, endIdx);

                      try {
                        const parsedData = JSON.parse(jsonString);
                        if (Array.isArray(parsedData) && parsedData.length > 0 && parsedData[0].module) {
                          parsedSchema = parsedData;
                          // Remove the JSON part from display content
                          displayContent = 
                            prompt.content.substring(0, startIdx).trim() +
                            (prompt.content.length > endIdx 
                              ? "\n" + prompt.content.substring(endIdx).trim()
                              : "");
                        }
                      } catch (error) {
                        console.error("Failed to parse schema:", error);
                      }
                    }

                    // Clean up any remaining code blocks in the display content
                    displayContent = displayContent
                      .replace(/```(?:json|js|javascript)?\n?/g, "") // Remove opening code block markers
                      .replace(/\n?```\n?/g, "") // Remove closing code block markers
                      .trim();

                    return (
                      <div key={prompt.id} className="bg-gray-800 rounded-lg p-4 max-w-[80%]">
                        <div className="whitespace-pre-wrap text-gray-200">
                          {displayContent}
                        </div>
                        {parsedSchema && (
                          <div className="mt-4 pt-4 border-t border-gray-700">
                            <SchemaViewer schema={parsedSchema} />
                          </div>
                        )}
                        {optimisticPrompt && (
                          <div className="mt-2 flex justify-end">
                            <Loader2 className="h-4 w-4 animate-spin ml-2" />
                          </div>
                        )}
                      </div>
                    );
                  })()
                )
              )
            )}
            {isSubmitting && !optimisticPrompt && (
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            {error && (
              <div className="text-red-500 text-sm mt-2 text-center">
                {error}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Textarea
              style={{ backgroundColor: "rgb(20,20,20)", color: "white" }}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              disabled={isSubmitting}
              placeholder="Type your message... (Shift + Enter for new line)"
              rows={1}
              className="min-h-[40px] max-h-[200px] resize-y"
            />
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        <div className="w-2/3 text-white bg-gray-800 overflow-y-auto">
          <iframe
            src="https://dbdiagram.io/e/683f352361dc3bf08d683b22/683f358061dc3bf08d684771"
            className="w-full h-full"
          />
        </div>
      </div>
    </div>
  );
}
