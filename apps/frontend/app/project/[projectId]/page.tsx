"use client";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";

import Appbar from "@/components/Appbar";
import AgentBar from "@/components/AgentBar";
import DbAgent from "@/components/DbAgent";
import FrontendAgent from "@/components/FrontendAgent";
import BackendAgent from "@/components/BackendAgent";

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

type AgentType = keyof typeof agentThemes;

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  
  const [selectedAgent, setSelectedAgent] = useState<AgentType>("db");
  const theme = useMemo(() => agentThemes[selectedAgent], [selectedAgent]);

  const [mounted, setMounted] = useState(false);

  // Client-side mounting
  useState(() => setMounted(true));
  if (!mounted) return null;

  const renderAgent = () => {
    switch (selectedAgent) {
      case "db":
        return <DbAgent projectId={projectId} theme={theme} />;
      case "frontend":
        return <FrontendAgent projectId={projectId} theme={theme} />;
      case "backend":
        return <BackendAgent projectId={projectId} theme={theme} />;
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
      />
      
      {renderAgent()}
    </div>
  );
}
