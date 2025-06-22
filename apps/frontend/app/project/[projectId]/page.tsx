"use client";
import Appbar from "@/components/Appbar";
import { use, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { usePrompts } from "@/app/hooks/usePrompts";
import { Loader2 } from "lucide-react";
import SchemaViewer from "@/components/SchemaViewer";
import { useSchema } from "@/app/hooks/useSchema";
import { OptimisticPrompt } from "@/types/prompt";
import { ProjectPageParams } from "@/types/pages";
import { useSubmitPrompt } from "@/app/hooks/useSubmitPrompt";

export default function ProjectPage({ params }: ProjectPageParams) {
  const { projectId } = use(params);
  const {
    prompts,
    mutate,
    isLoading: isLoadingPrompts,
  } = usePrompts(projectId);
  const { error: schemaError, parseAndUpdateSchema } = useSchema(projectId);
  const {
    submitPrompt,
    isSubmitting,
    error: submitError,
  } = useSubmitPrompt(projectId);

  const [mounted, setMounted] = useState(false);
  const [prompt, setPrompt] = useState("");
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [optimisticPrompt, setOptimisticPrompt] =
    useState<OptimisticPrompt | null>(null);

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
    setOptimisticPrompt({
      id: tempId,
      content: trimmedPrompt,
      promptType: "USER",
    });

    // Clear input immediately
    setPrompt("");

    try {
      const data = await submitPrompt(trimmedPrompt);
      await mutate();
      const responseText = data?.response?.content?.[0]?.text;
      if (
        responseText &&
        responseText.includes("[") &&
        responseText.includes("]")
      ) {
        parseAndUpdateSchema(responseText);
      }
    } catch {
      setPrompt(trimmedPrompt);
    } finally {
      setOptimisticPrompt(null);
    }
  };

  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return null;
  }

  const optimisticPromptNotInList =
    optimisticPrompt && !prompts?.find((p) => p.id === optimisticPrompt.id);
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
                      <div className="whitespace-pre-wrap">
                        {prompt.content}
                      </div>
                    </div>
                  </div>
                ) : (
                  (() => {
                    let parsedSchema = null;
                    let displayContent = prompt.content;

                    // First try to extract and parse any JSON schema data
                    if (
                      prompt.content &&
                      prompt.content.includes("[") &&
                      prompt.content.includes("]")
                    ) {
                      const startIdx = prompt.content.indexOf("[");
                      const endIdx = prompt.content.lastIndexOf("]") + 1;
                      const jsonString = prompt.content.substring(
                        startIdx,
                        endIdx
                      );

                      try {
                        const parsedData = JSON.parse(jsonString);
                        if (
                          Array.isArray(parsedData) &&
                          parsedData.length > 0 &&
                          parsedData[0].module
                        ) {
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
                      <div
                        key={prompt.id}
                        className="bg-gray-800 rounded-lg p-4 max-w-[80%]"
                      >
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
            {submitError && (
              <div className="text-red-500 text-sm mt-2 text-center">
                {submitError}
              </div>
            )}
            {schemaError && (
              <div className="text-red-500 text-sm mt-2 text-center">
                {schemaError}
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
