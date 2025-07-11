import React, { useState, useEffect } from "react";
import { Database, Code, Server, type LucideIcon } from "lucide-react";

// Theme type definition
type Theme = {
  accent: string;
  accentLight: string;
  gradientFrom: string;
  gradientTo: string;
};

type AgentType = "db" | "frontend" | "backend";

// Agent status type
type AgentStatus = {
  type: AgentType;
  name: string;
  status: "idle" | "processing" | "completed" | "error";
  progress: number;
  icon: LucideIcon;
  description: string;
  isCompleted: boolean;
};

type AgentBarProps = {
  selectedAgent: AgentType;
  setSelectedAgent: (agent: AgentType) => void;
  agentThemes: Record<AgentType, Theme>;
  isCompleted: {
    db: boolean;
    backend: boolean;
    frontend: boolean;
  };
};

const AgentBar = ({ selectedAgent, setSelectedAgent, agentThemes, isCompleted }: AgentBarProps) => {
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([
    {
      type: "db",
      name: "DB Engineer",
      status: "idle",
      progress: 0,
      icon: Database,
      description: "Database schema design & optimization",
      isCompleted: isCompleted.db,
    },
    {
      type: "backend",
      name: "Backend Dev",
      status: "idle",
      progress: 0,
      icon: Server,
      description: "API & server-side logic",
      isCompleted: isCompleted.backend,
    },
    {
      type: "frontend",
      name: "Frontend Dev",
      status: "idle",
      progress: 0,
      icon: Code,
      description: "UI/UX implementation",
      isCompleted: isCompleted.frontend,
    },
  ]);

  // Update agent statuses when isCompleted prop changes
  useEffect(() => {
    setAgentStatuses(prevStatuses =>
      prevStatuses.map(agent => ({
        ...agent,
        status: isCompleted[agent.type] ? "completed" : agent.status === "processing" ? "processing" : "idle",
        isCompleted: isCompleted[agent.type],
      }))
    );
  }, [isCompleted]);

  const theme = agentThemes[selectedAgent] || agentThemes.db; // Default to db theme if none selected

  const getStatusColor = (agent: AgentStatus) => {
    switch (agent.status) {
      case "completed":
        return "bg-green-500";
      case "processing":
        return "bg-yellow-500 animate-pulse";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-600";
    }
  };

  return (
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
                : {
                    backgroundColor: "rgba(24,24,27,0.6)",
                    borderColor: "rgba(63,63,70,0.6)",
                  }
            }
          >
            <div
              className="p-3 rounded-full mb-3"
              style={{
                backgroundColor:
                  selectedAgent === agent.type
                    ? theme.accentLight
                    : "rgba(38,38,42,0.6)",
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
              style={{
                color: selectedAgent === agent.type ? theme.accent : "#d1d5db",
              }}
            >
              {agent.name}
            </div>
            <div className="text-xs text-gray-400 text-center">
              {agent.description}
            </div>
            <div
              className={`absolute top-2 right-2 w-2 h-2 rounded-full ${getStatusColor(agent)}`}
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
  );
};

export default AgentBar;
