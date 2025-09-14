import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Code2 } from "lucide-react";
import { toast } from "sonner";
import { useGenerateFrontend } from "@/app/hooks/useGenerateFrontend";
import { useFrontendPrompts } from "@/app/hooks/useFrontendPrompts";
import { useSubmitPrompt } from "@/app/hooks/useSubmitPrompt";
import type { OptimisticPrompt } from "@/types/prompt";
interface FrontendAgentProps {
  projectId: string; // Used for API calls to identify the project context
  theme: {
    accent: string;
    accentLight: string;
    gradientFrom: string;
    gradientTo: string;
  };
}

export default function FrontendAgent({ projectId, theme }: FrontendAgentProps) {
  const {
    prompts,
    mutate,
    isLoading: isLoadingPrompts,
    error: promptsError,
  } = useFrontendPrompts(projectId);

  const {
    submitPrompt,
    isSubmitting,
    error: submitError,
  } = useSubmitPrompt(projectId);

  const [prompt, setPrompt] = useState("");
  const [optimisticPrompt, setOptimisticPrompt] = useState<OptimisticPrompt | null>(null);
  const [activeTab, setActiveTab] = useState<'codeserver' | 'docs'>('codeserver');
  
  const { generateFrontend, isGenerating } = useGenerateFrontend(projectId);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [optimisticPrompt, prompts]);

  const handleGenerateFrontend = async () => {
    try {
      await generateFrontend();
      // Add a system message about successful generation
      const systemMessage: OptimisticPrompt = {
        id: Date.now().toString(),
        content: "Frontend code has been generated successfully. You can now start customizing and extending the components.",
        promptType: "ASSISTANT"
      };
      mutate([...(prompts || []), systemMessage], false);
    } catch (error) {
      console.error('Frontend generation failed:', error);
    }
  };

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
    if (prompts) {
      mutate([...prompts, newPrompt], false);
    } else {
      mutate([newPrompt], false);
    }

    // Clear input immediately
    setPrompt("");

    try {
      const response = await submitPrompt(trimmedPrompt);
      if (response) {
        await mutate();
      }
    } catch (error) {
      setPrompt(trimmedPrompt); // Restore prompt on error
      toast.error('Failed to submit prompt', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setOptimisticPrompt(null);
    }
  };

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
        <div className="whitespace-pre-wrap text-gray-200">{prompt.content}</div>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Chat Section */}
      <div className="w-1/3 flex flex-col justify-between p-4">
        <div className="flex justify-between items-center">
          <div className="text-2xl font-bold" style={{ color: theme.accent }}>
            Frontend Assistant
          </div>
        </div>

        {(promptsError || submitError) && (
          <div className="text-red-500 text-sm mt-2 text-center">
            {promptsError || submitError}
          </div>
        )}
        
        {/* Chat Messages */}
        <div
          ref={chatContainerRef}
          className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-200px)]"
          style={{ color: "#f3f4f6" }}
        >
          {isLoadingPrompts && !prompts?.length ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 
                className="h-6 w-6 animate-spin"
                style={{ color: theme.accent }}
              />
            </div>
          ) : prompts?.length ? (
            <>
              {prompts.map(renderPromptMessage)}
              {isSubmitting && !optimisticPrompt && (
                <div className="flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col justify-center items-center h-32 gap-3">
              <Button
                onClick={handleGenerateFrontend}
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
                    <span>Generate Frontend</span>
                  </>
                )}
              </Button>
              <p className="text-sm text-gray-400 text-center max-w-xs">
                Start by generating the frontend components and structure for your application
              </p>
            </div>
          )}
        </div>

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
            placeholder="Ask about UI components, styling, or frontend features..."
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

      {/* Code Server Section */}
      <div className="w-2/3 text-white bg-gray-800 overflow-y-auto relative">
        {/* Tab Navigation */}
        <div className="bg-gray-900 border-b border-gray-700">
          <div className="flex items-center">
            <button
              onClick={() => setActiveTab('codeserver')}
              className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-200 ${
                activeTab === 'codeserver'
                  ? 'border-blue-500 text-blue-400 bg-gray-800'
                  : 'border-transparent text-gray-400 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              <Code2 className="w-4 h-4" />
              <span>Codebase</span>
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-200 ${
                activeTab === 'docs'
                  ? 'border-blue-500 text-blue-400 bg-gray-800'
                  : 'border-transparent text-gray-400 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              <svg 
                className="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
                />
              </svg>
              <span>Frontend Preview</span>
            </button>
          </div>
        </div>
        
        {/* Tab Content */}
        <div className="relative h-full">
          {activeTab === 'codeserver' && (
            <iframe
              src="http://localhost:8444/?folder=/tmp/stich-worker-frontend"
              className="w-full border-0"
              title="Code Server"
              style={{ height: 'calc(100vh - 64px - 56px)' }}
              allow="clipboard-read; clipboard-write"
            />
          )}
          {activeTab === 'docs' && (
            <iframe
              src="http://localhost:5173"
              className="w-full border-0"
              title="Frontend Preview"
              style={{ height: 'calc(100vh - 64px - 56px)' }}
              allow="clipboard-read; clipboard-write"
            />
          )}
        </div>
      </div>
    </div>
  );
} 