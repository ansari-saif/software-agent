import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Database, Code2 } from "lucide-react";
import { toast } from "sonner";

import { useBackendPrompts } from "@/app/hooks/useBackendPrompts";
import { useSubmitBackendPrompt } from "@/app/hooks/useSubmitBackendPrompt";
import { useGenerateBackend } from "@/app/hooks/useGenerateBackend";

import type { OptimisticPrompt } from "@/types/prompt";
import { Project } from "@/types/schema";

interface BackendAgentProps {
  projectId: string;
  theme: {
    accent: string;
    accentLight: string;
    gradientFrom: string;
    gradientTo: string;
  };
  project: Project | undefined;
}

export default function BackendAgent({
  projectId,
  theme,
  project,
}: BackendAgentProps) {
  const {
    prompts,
    mutate,
    isLoading: isLoadingPrompts,
    error: promptsError,
  } = useBackendPrompts(projectId);

  const { generateBackend, isGenerating } = useGenerateBackend(projectId);

  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    if (project?.schema) {
      setIsReady(true);
    }
  }, [project]);

  const {
    submitPrompt,
    isSubmitting,
    error: submitError,
  } = useSubmitBackendPrompt(projectId);

  const [prompt, setPrompt] = useState("");
  const [optimisticPrompt, setOptimisticPrompt] =
    useState<OptimisticPrompt | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [optimisticPrompt, prompts]);

  const handleSubmit = async () => {
    if (!prompt.trim() || isSubmitting) return;

    const trimmedPrompt = prompt.trim();
    const tempId = Date.now().toString();

    // Set optimistic prompt
    const newPrompt: OptimisticPrompt = {
      id: tempId,
      content: trimmedPrompt,
      promptType: "USER",
    };

    setOptimisticPrompt(newPrompt);

    // Clear input immediately
    setPrompt("");

    try {
      const response = await submitPrompt(trimmedPrompt);
      if (response) {
        await mutate();
      }
    } catch (error) {
      setPrompt(trimmedPrompt); // Restore prompt on error
      toast.error("Failed to submit prompt", {
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      });
    } finally {
      setOptimisticPrompt(null);
    }
  };

  const handleGenerateBackend = async () => {
    try {
      await generateBackend();
      await mutate(); // Refresh prompts after generation
    } catch (error) {
      // Error is already handled in the hook
      console.error('Backend generation failed:', error);
    }
  };

  const optimisticPromptNotInList =
    optimisticPrompt &&
    !prompts?.find((p: OptimisticPrompt) => p.id === optimisticPrompt.id);
  const allPrompts = optimisticPromptNotInList
    ? [...(prompts || []), optimisticPrompt]
    : prompts;

  const renderPromptMessage = (prompt: OptimisticPrompt) => {
    if (prompt.promptType === "USER") {
      return (
        <div key={prompt.id} className="flex justify-end">
          <div
            className="rounded-lg p-4 max-w-[80%]"
            style={{
              backgroundColor: "rgba(0,0,0,0.4)",
              borderLeft: `2px solid ${theme.accent}`,
            }}
          >
            <div className="whitespace-pre-wrap">{prompt.content}</div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={prompt.id}
        className="rounded-lg p-4 max-w-[80%]"
        style={{
          backgroundColor: "rgba(17,17,17,0.6)",
          borderLeft: `2px solid ${theme.accent}80`,
        }}
      >
        <div className="whitespace-pre-wrap text-gray-200">
          {prompt.content}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Chat Section */}
      <div className="w-1/3 flex flex-col justify-between p-4">
        <div className="flex justify-between items-center">
          <div className="text-2xl font-bold" style={{ color: theme.accent }}>
            Backend Assistant
          </div>
        </div>

        {(promptsError || submitError) && (
          <div className="text-red-500 text-sm mt-2 text-center">
            {promptsError || submitError}
          </div>
        )}
        {isReady ? (
          <div
            ref={chatContainerRef}
            className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-200px)]"
            style={{ color: "#f3f4f6" }}
          >
            {isLoadingPrompts && !allPrompts?.length ? (
              <div className="flex justify-center items-center h-32">
                <Loader2
                  className="h-6 w-6 animate-spin"
                  style={{ color: theme.accent }}
                />
              </div>
            ) : allPrompts?.length ? (
              allPrompts?.map(renderPromptMessage)
            ) : (
              <div className="flex flex-col justify-center items-center h-32 gap-3">
                <Button
                  onClick={handleGenerateBackend}
                  disabled={isGenerating}
                  className="flex items-center gap-2 px-4 py-2 transition-all duration-200 hover:opacity-90"
                  style={{ backgroundColor: theme.accent }}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Code2 className="h-4 w-4" />
                      <span>Generate Backend</span>
                    </>
                  )}
                </Button>
                <p className="text-sm text-gray-400 text-center max-w-xs">
                  Start by generating the backend infrastructure based on your schema
                </p>
              </div>
            )}

            {isSubmitting && !optimisticPrompt && (
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
            <div className="relative">
              <Database className="w-12 h-12" style={{ color: theme.accent }} />
              <div className="absolute -top-1 -right-1">
                <div className="animate-spin">
                  <Loader2 className="w-6 h-6" style={{ color: theme.accentLight }} />
                </div>
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold" style={{ color: theme.accent }}>
                Create Database Schema First
              </h3>
              <p className="text-gray-400 max-w-md">
                Please create your database schema using the DB Agent before proceeding. 
                Once the schema is ready, you can return here to work with the Backend Assistant.
              </p>
            </div>
          </div>
        )}
        {/* Chat Messages */}

        {/* Input Section */}
        <div className="flex gap-2">
          <Textarea
            style={{
              backgroundColor: "rgba(31,31,35,0.8)",
              color: "#f9fafb",
              borderColor: `${theme.accent}55`,
            }}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            disabled={isSubmitting}
            placeholder="Ask about APIs, server logic, or backend features..."
            rows={1}
            className="min-h-[40px] max-h-[200px] resize-y"
          />
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="hover:opacity-90"
            style={{ backgroundColor: theme.accent }}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* API Documentation Section */}
      <div className="w-2/3 text-white bg-gray-800 overflow-y-auto relative">
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-gray-400">
            <p>API Documentation</p>
            <p className="text-sm mt-2">
              API endpoints and documentation will appear here
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
