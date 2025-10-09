"use client";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";

import Appbar from "@/components/Appbar";
import AgentBar from "@/components/AgentBar";
import DbAgent from "@/components/DbAgent";
import FrontendAgent from "@/components/FrontendAgent";
import BackendAgent from "@/components/BackendAgent";
import { useProject } from "@/app/hooks/useProject";

// Theme definitions for each agent
const agentThemes = {
  db: {
    accent: "#2F80ED", // blue
    accentLight: "rgba(47,128,237,0.15)",
    gradientFrom: "#0F2027",
    gradientTo: "#203A43",
  },
  backend: {
    accent: "#34D399", // green
    accentLight: "rgba(52,211,153,0.15)",
    gradientFrom: "#0f3b21",
    gradientTo: "#134e4a",
  },
  frontend: {
    accent: "#FF5F6D", // coral/pink
    accentLight: "rgba(255,95,109,0.15)",
    gradientFrom: "#41295a",
    gradientTo: "#2F0743",
  },
} as const;

type AgentType = keyof typeof agentThemes;

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const {
    project,
    refetch: refetchProject
  } = useProject(projectId);
  const [isCompleted, setIsCompleted] = useState({
    db: false,
    frontend: false,
    backend: false,
  });

  const [selectedAgent, setSelectedAgent] = useState<AgentType>("db");
  const theme = useMemo(() => agentThemes[selectedAgent], [selectedAgent]);

  const [mounted, setMounted] = useState(false);
  const setAgentCompleted = useCallback((agent: AgentType, completed: boolean) => {
    setIsCompleted((prev) => {
      const newIsCompleted = { ...prev, [agent]: completed }
      return newIsCompleted;
    });
  }, []);

  const setDbCompleted = useCallback((completed: boolean) => {
    setAgentCompleted("db", completed);
  }, [setAgentCompleted]);
  // const setFrontendCompleted = (completed: boolean) => {
  //   setAgentCompleted("frontend", completed);
  // }
  // const setBackendCompleted = (completed: boolean) => {
  //   setAgentCompleted("backend", completed);
  // }

  // Client-side mounting
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;

  const renderAgent = () => {
    switch (selectedAgent) {
      case "db":
        return <DbAgent projectId={projectId} theme={theme} setDbCompleted={setDbCompleted} project={project} refetchProject={refetchProject} />;
      case "frontend":
        return <FrontendAgent projectId={projectId} theme={theme}  project={project}  />;
      case "backend":
        return <BackendAgent projectId={projectId} theme={theme} project={project}  />;
      default:
        return null;
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: `linear-gradient(135deg, ${theme.gradientFrom} 0%, ${theme.gradientTo} 100%)`,
      }}
    >
      <Appbar />
      <AgentBar
        selectedAgent={selectedAgent}
        setSelectedAgent={setSelectedAgent}
        agentThemes={agentThemes}
        isCompleted={isCompleted}
      />

      {renderAgent()}
    </div>
  );
}
