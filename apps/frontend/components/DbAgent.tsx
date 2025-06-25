import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import type { Schema } from "@/types/schema";

import SchemaViewer from "@/components/SchemaViewer";
import DbmlDiagramLoading from "@/components/DbmlDiagramLoading";
import DbmlDiagramViewer from "@/components/DbmlDiagramViewer";
import DbmlDiagramEmpty from "@/components/DbmlDiagramEmpty";

import { usePrompts } from "@/app/hooks/usePrompts";
import { useSchema } from "@/app/hooks/useSchema";
import { useSubmitPrompt } from "@/app/hooks/useSubmitPrompt";
import { useProject } from "@/app/hooks/useProject";
import { useGenerateDbml } from "@/app/hooks/useGenerateDbml";

import type { OptimisticPrompt } from "@/types/prompt";

interface DbAgentProps {
  projectId: string;
  theme: {
    accent: string;
    accentLight: string;
    gradientFrom: string;
    gradientTo: string;
  };
}

export default function DbAgent({ projectId, theme }: DbAgentProps) {

  const {
    prompts,
    mutate,
    isLoading: isLoadingPrompts,
  } = usePrompts(projectId);
  const [schema, setSchema] = useState<Schema | null | undefined>(null);
  const { project } = useProject(projectId);
  const [dbmlDiagramId, setDbmlDiagramId] = useState<string | null>(null);
  const [isGeneratingDbml, setIsGeneratingDbml] = useState(false);
  const [optimisticPrompt, setOptimisticPrompt] = useState<OptimisticPrompt | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  const { error: schemaError, parseAndUpdateSchema } = useSchema(projectId);
  const [isJsonCreated, setIsJsonCreated] = useState(false);
  const {
    submitPrompt,
    isSubmitting,
    error: submitError,
  } = useSubmitPrompt(projectId);

  const {
    generateDbml,
    error: dbmlError,
    isSuccess,
    dbmlData,
  } = useGenerateDbml(projectId);

  const [prompt, setPrompt] = useState("");

  // Combined effect for project data updates
  useEffect(() => {
    if (project) {
      setSchema(project.schema);
      setDbmlDiagramId(project.dbml_diagram_id || null);
      if(project.schema) {
        setIsJsonCreated(true);
      }
    }
  }, [project]);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [optimisticPrompt, prompts]);

  // Show success toast when DBML is generated
  useEffect(() => {
    if (isSuccess && dbmlData) {
      toast.success("DBML diagram generated successfully", {
        description: "The diagram is now displayed in the right panel",
      });
    }
  }, [isSuccess, dbmlData]);

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
      if (responseText?.includes("[") && responseText?.includes("]")) {
        await parseAndUpdateSchema(responseText);
        setIsJsonCreated(true);
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

  const handleGenerateDbml = async () => {
    setIsGeneratingDbml(true);
    
    try {
      const result = await generateDbml();
      if (result?.dbml_diagram_id) {
        setIsJsonCreated(true);

        // Update both states together
        setDbmlDiagramId(result.dbml_diagram_id);
        if (project?.schema) {
          setIsJsonCreated(true);
          setSchema(project.schema);
        }
      }
    } catch (error) {
      toast.error("Failed to generate DBML diagram", {
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      });
    } finally {
      setIsGeneratingDbml(false);
      
    }
  };

  const optimisticPromptNotInList =
    optimisticPrompt && !prompts?.find((p) => p.id === optimisticPrompt.id);
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

    let parsedSchema = null;
    let displayContent = prompt.content;

    // Try to extract and parse any JSON schema data
    if (displayContent?.includes("[") && displayContent?.includes("]")) {
      const startIdx = displayContent.indexOf("[");
      const endIdx = displayContent.lastIndexOf("]") + 1;
      const jsonString = displayContent.substring(startIdx, endIdx);

      try {
        const parsedData = JSON.parse(jsonString);
        if (
          Array.isArray(parsedData) &&
          parsedData.length > 0 &&
          parsedData[0].module
        ) {
          parsedSchema = parsedData;
          displayContent =
            displayContent.substring(0, startIdx).trim() +
            (displayContent.length > endIdx
              ? "\n" + displayContent.substring(endIdx).trim()
              : "");
        }
      } catch (error) {
        console.error("Failed to parse schema:", error);
      }
    }

    // Clean up code blocks
    displayContent = displayContent
      .replace(/```(?:json|js|javascript)?\n?/g, "")
      .replace(/\n?```\n?/g, "")
      .trim();

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
          {displayContent}
        </div>
        {parsedSchema && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <SchemaViewer schema={parsedSchema} />
          </div>
        )}
      </div>
    );
  };

  const renderDbmlDiagram = () => {
    console.log("inside a renderDbmlDiagram -------===============>>>>>>>>");
    console.log("dbmlDiagramId", dbmlDiagramId);
    console.log("isGeneratingDbml", isGeneratingDbml);
    console.log("schema", schema);
    console.log("project", project);
    if (dbmlDiagramId) {
      return (
        <div className="w-2/3 text-white bg-gray-800 overflow-y-auto relative">
          {isGeneratingDbml ? (
            <DbmlDiagramLoading />
          ) : (
            <DbmlDiagramViewer 
              dbmlId={project?.dbml_id || ''} 
              diagramId={dbmlDiagramId} 
            />
          )}
        </div>
      );
    }

    return (
      <DbmlDiagramEmpty 
        hasSchema={!!schema}
        isGenerating={isGeneratingDbml}
        onGenerate={handleGenerateDbml}
        isJsonCreated={isJsonCreated}
      />
    );
  };

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Chat Section */}
      <div className="w-1/3 flex flex-col justify-between p-4">
        <div className="flex justify-between items-center">
          <div className="text-2xl font-bold" style={{ color: theme.accent }}>
            DB Assistant
          </div>
        </div>

        {dbmlError && (
          <div className="text-red-500 text-sm mt-2 bg-red-950/50 p-2 rounded">
            {dbmlError}
          </div>
        )}

        {/* Chat Messages */}
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
          ) : (
            allPrompts?.map(renderPromptMessage)
          )}

          {isSubmitting && !optimisticPrompt && (
            <div className="flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}

          {(submitError || schemaError) && (
            <div className="text-red-500 text-sm mt-2 text-center">
              {submitError || schemaError}
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
            placeholder="Type your message... (Shift + Enter for new line)"
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

      {/* DBML Diagram Section */}
      {renderDbmlDiagram()}
    </div>
  );
}
