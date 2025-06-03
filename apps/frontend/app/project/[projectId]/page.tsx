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
  const { prompts } = usePrompts(projectId);
  const [mounted, setMounted] = React.useState(false);
  const { getToken } = useAuth();
  const [prompt, setPrompt] = React.useState("");
  const chatContainerRef = React.useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
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
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [optimisticPrompt]); // Only scroll when optimistic prompt changes, not on API updates

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
      console.error("response", response.data);
      // Check if response contains schema data
      if (
        response.data &&
        response.data.includes("[") &&
        response.data.includes("]")
      ) {
        try {
          console.error("andart gya");

          // Extract JSON array from mixed text
          const startIdx = response.data.indexOf("[");
          const endIdx = response.data.lastIndexOf("]") + 1;
          const jsonString = response.data.substring(startIdx, endIdx);
          const parsedData = JSON.parse(jsonString);
          if (
            Array.isArray(parsedData) &&
            parsedData.length > 0 &&
            parsedData[0].module
          ) {
            setSchemaData(parsedData);
          }
        } catch (e) {
          console.error("Failed to extract/parse schema data:", e);
        }
      }
    } catch (error) {
      console.error("Failed to submit prompt:", error);
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

  const allPrompts = optimisticPrompt
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
            {allPrompts?.map((prompt) =>
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
                  if (
                    prompt.content &&
                    prompt.content.includes("[") &&
                    prompt.content.includes("]")
                  ) {
                    let startIdx = prompt.content.indexOf("[");
                    let endIdx = prompt.content.lastIndexOf("]") + 1;

                    // Remove markdown code block markers before the JSON array
                    // Look for ```json, ```js, or ``` just before the [
                    const codeBlockRegex = /(```json|```js|```)[ \t]*\n?$/i;
                    const beforeJson = prompt.content.substring(0, startIdx);
                    const codeBlockMatch = beforeJson.match(codeBlockRegex);
                    if (codeBlockMatch) {
                      startIdx = beforeJson.lastIndexOf(codeBlockMatch[0]);
                    }

                    const jsonString = prompt.content.substring(
                      prompt.content.indexOf("["),
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
                        // Remove the JSON part and code block marker from the display content
                        displayContent =
                          prompt.content.substring(0, startIdx).trim() +
                          (prompt.content.length > endIdx
                            ? " " + prompt.content.substring(endIdx).trim()
                            : "");
                      }
                    } catch (e) {
                      // handle error
                    }
                  }
                  return (
                    <div key={prompt.id}>
                      <div className="whitespace-pre-wrap">
                        {displayContent}
                      </div>
                      {parsedSchema && <SchemaViewer schema={parsedSchema} />}
                      {optimisticPrompt && (
                        <Loader2 className="h-4 w-4 animate-spin ml-2" />
                      )}
                    </div>
                  );
                })()
              )
            )}
            {isSubmitting && !optimisticPrompt && (
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
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
