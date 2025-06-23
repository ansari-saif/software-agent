"use client";
import Appbar from "@/components/Appbar";
import { use, useEffect, useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Send, FileDown, Database, Code, Server, type LucideIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { usePrompts } from "@/app/hooks/usePrompts";
import { Loader2 } from "lucide-react";
import SchemaViewer from "@/components/SchemaViewer";
import { useSchema } from "@/app/hooks/useSchema";
import { OptimisticPrompt } from "@/types/prompt";
import { ProjectPageParams } from "@/types/pages";
import { useSubmitPrompt } from "@/app/hooks/useSubmitPrompt";
import { useProject } from "@/app/hooks/useProject";
import { useGenerateDbml } from "@/app/hooks/useGenerateDbml";
import { toast } from "sonner";

// New agent status type
type AgentStatus = {
  type: "db" | "frontend" | "backend";
  name: string;
  status: "idle" | "processing" | "completed" | "error";
  progress: number;
  icon: LucideIcon;
  description: string;
};

// Theme definitions for each agent
const agentThemes = {
  db: {
    accent: "#2F80ED", // blue
    accentLight: "rgba(47,128,237,0.15)",
    gradientFrom: "#0F2027",
    gradientTo: "#203A43",
  },
  frontend: {
    accent: "#FF5F6D", // coral/pink
    accentLight: "rgba(255,95,109,0.15)",
    gradientFrom: "#41295a",
    gradientTo: "#2F0743",
  },
  backend: {
    accent: "#34D399", // green
    accentLight: "rgba(52,211,153,0.15)",
    gradientFrom: "#0f3b21",
    gradientTo: "#134e4a",
  },
} as const;

export default function ProjectPage({ params }: ProjectPageParams) {
  const { projectId } = use(params);
  const {
    prompts,
    mutate,
    isLoading: isLoadingPrompts,
  } = usePrompts(projectId);
  const { project } = useProject(projectId);
  const { error: schemaError, parseAndUpdateSchema } = useSchema(projectId);
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
    reset: resetDbml,
  } = useGenerateDbml(projectId);

  const [mounted, setMounted] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [dbmlDiagramId, setDbmlDiagramId] = useState<string | null>(null);
  const [isGeneratingDbml, setIsGeneratingDbml] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [optimisticPrompt, setOptimisticPrompt] =
    useState<OptimisticPrompt | null>(null);

  // Agent selection state
  const [selectedAgent, setSelectedAgent] =
    useState<"db" | "frontend" | "backend">("db");

  const agents: AgentStatus[] = [
    {
      type: "db",
      name: "DB Engineer",
      status: "idle",
      progress: 0,
      icon: Database,
      description: "Database schema design & optimization",
    },
    {
      type: "frontend",
      name: "Frontend Dev",
      status: "idle",
      progress: 0,
      icon: Code,
      description: "UI/UX implementation",
    },
    {
      type: "backend",
      name: "Backend Dev",
      status: "idle",
      progress: 0,
      icon: Server,
      description: "API & server-side logic",
    },
  ];

  const [agentStatuses] = useState<AgentStatus[]>(agents);

  // Current theme based on selected agent
  const theme = useMemo(() => agentThemes[selectedAgent], [selectedAgent]);

  // Sync dbmlDiagramId with project data
  useEffect(() => {
    if (project?.dbml_diagram_id) {
      setDbmlDiagramId(project.dbml_diagram_id);
    } else {
      setDbmlDiagramId(null);
    }
  }, [project?.dbml_diagram_id]);

  // Reset states when changing projects
  useEffect(() => {
    resetDbml();
    setDbmlDiagramId(null);
  }, [projectId]);

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

  const handleGenerateDbml = async () => {
    setIsGeneratingDbml(true);
    try {
      const result = await generateDbml();
      if (result?.dbml_diagram_id) {
        setDbmlDiagramId(result.dbml_diagram_id);
      }
    } catch {
      // Error is already handled in the hook
    } finally {
      setIsGeneratingDbml(false);
    }
  };

  // Show success toast when DBML is generated
  useEffect(() => {
    if (isSuccess && dbmlData) {
      toast.success('DBML diagram generated successfully', {
        description: 'The diagram is now displayed in the right panel',
      });
    }
  }, [isSuccess, dbmlData]);

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
    <div
      className="min-h-screen"
      style={{
        background: `linear-gradient(135deg, ${theme.gradientFrom} 0%, ${theme.gradientTo} 100%)`,
      }}
    >
      <Appbar />
      {/* Agent Selection Header */}
      <div
        className="p-4 border-b backdrop-blur-md"
        style={{
          borderColor: theme.accent + "80",
          background: `linear-gradient(90deg, ${theme.gradientFrom}80 0%, ${theme.gradientTo}80 100%)`,
        }}
      >
        <div className="grid grid-cols-3 gap-4">
          {agentStatuses.map((agent) => (
            <button
              key={agent.type}
              onClick={() => setSelectedAgent(agent.type)}
              className={`relative flex flex-col items-center p-4 rounded-xl transition-all duration-200 border-2`}
              style={
                selectedAgent === agent.type
                  ? {
                      backgroundColor: theme.accentLight,
                      borderColor: theme.accent,
                      boxShadow: `0 0 8px ${theme.accent}55`,
                    }
                  : { backgroundColor: "rgba(24,24,27,0.6)", borderColor: "rgba(63,63,70,0.6)" }
              }
            >
              <div
                className="p-3 rounded-full mb-3"
                style={{
                  backgroundColor:
                    selectedAgent === agent.type ? theme.accentLight : "rgba(38,38,42,0.6)",
                }}
              >
                {(() => {
                  const agentTheme = agentThemes[agent.type];
                  return (
                    <agent.icon
                      className="w-5 h-5"
                      style={{ color: agentTheme.accent }}
                    />
                  );
                })()}
              </div>
              <div
                className="text-sm font-medium mb-1"
                style={{ color: selectedAgent === agent.type ? theme.accent : "#d1d5db" }}
              >
                {agent.name}
              </div>
              <div className="text-xs text-gray-400 text-center">
                {agent.description}
              </div>
              
              <div
                className={`absolute top-2 right-2 w-2 h-2 rounded-full  `}
              />
              {agent.status === "processing" && (
                <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-xl">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${agent.progress}%`,
                      backgroundColor: theme.accent,
                    }}
                  />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="flex h-[calc(100vh-64px)]">
        <div className="w-1/3 flex flex-col justify-between p-4">
          <div className="flex justify-between items-center">
            <div
              className="text-2xl font-bold"
              style={{ color: theme.accent }}
            >
              Chat History
            </div>
          </div>
          {dbmlError && (
            <div className="text-red-500 text-sm mt-2 bg-red-950/50 p-2 rounded">
              {dbmlError}
            </div>
          )}
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
              allPrompts?.map((prompt) =>
                prompt.promptType === "USER" ? (
                  <div key={prompt.id} className="flex justify-end">
                    <div
                      className="rounded-lg p-4 max-w-[80%]"
                      style={{
                        backgroundColor: "rgba(0,0,0,0.4)",
                        borderLeft: `2px solid ${theme.accent}`,
                      }}
                    >
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
                  })()
                )
              )
            )}
            {isSubmitting && !optimisticPrompt && (
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#ffffff" }} />
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
              style={{
                backgroundColor: "rgba(31,31,35,0.8)",
                color: "#f9fafb",
                borderColor: theme.accent + "55",
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
              className="min-h-[40px] max-h-[200px] resize-y border-blue-500/20"
            />
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="hover:opacity-90"
              style={{ backgroundColor: theme.accent }}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#ffffff" }} />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        {dbmlDiagramId && project?.dbml_id && (
          <div className="w-2/3 text-white bg-gray-800 overflow-y-auto relative">
            {isGeneratingDbml ? (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mb-4" />
                  <p className="text-gray-400">Generating DBML diagram...</p>
                </div>
              </div>
            ) : (
              <>
                <iframe
                  key={`${project.dbml_id}-${dbmlDiagramId}`}
                  src={`https://dbdiagram.io/e/${project.dbml_id}/${dbmlDiagramId}`}
                  className="w-full h-full"
                  title="DBML Diagram"
                  onLoad={(e) => {
                    // Remove loading state when iframe loads
                    const target = e.target as HTMLIFrameElement;
                    if (target.parentElement) {
                      const loader = target.parentElement.querySelector('.iframe-loader');
                      if (loader) {
                        loader.classList.add('opacity-0');
                        setTimeout(() => loader.remove(), 300);
                      }
                    }
                  }}
                />
                <div className="iframe-loader absolute inset-0 flex items-center justify-center bg-gray-800 transition-opacity duration-300">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              </>
            )}
          </div>
        )}
        {!dbmlDiagramId && project?.schema && (
          <div className="w-2/3 flex items-center justify-center text-white bg-gray-800">
            <div className="text-center">
              <p className="mb-4 text-gray-400">No diagram generated yet</p>
              <Button onClick={handleGenerateDbml} disabled={isGeneratingDbml}>
                {isGeneratingDbml ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <FileDown className="h-4 w-4 mr-2" />
                )}
                Generate DBML Diagram
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
