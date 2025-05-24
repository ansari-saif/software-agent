"use client";

import React, { useState, useEffect, useRef } from "react";
import { Folder, FileText } from "lucide-react";
import { motion } from "framer-motion";
import axios from "axios";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "../config";
type Project = {
  id: string;
  description: string;
  createdAt: string;
};
export default function ProjectHistorySidebar() {
  const [open, setOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const { getToken } = useAuth();
  const prevOpen = useRef(false);

  const fetchProjects = async () => {
    const token = await getToken();
    console.log({BACKEND_URL});
    const projectsResult = await axios.post(
      `${BACKEND_URL}/projects`,
      {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  setProjects(projectsResult.data);
};
  useEffect(() => {
    
  fetchProjects();
  }, []);

  // Open sidebar when mouse is near the left edge
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX < 24) {
        setOpen(true);
      } else if (
        sidebarRef.current &&
        !sidebarRef.current.contains(
          document.elementFromPoint(e.clientX, e.clientY) as Node
        )
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    if (open && !prevOpen.current) {
      fetchProjects();
    }
    prevOpen.current = open;
  }, [open]);

  return (
    <div
      ref={sidebarRef}
      className={`fixed top-0 left-0 h-full z-40 transition-transform duration-300 border-r border-[--color-sidebar-border] shadow-lg w-64 text-white ${open ? "translate-x-0" : "-translate-x-full"}`}
      style={{ background: "rgb(23 23 23)" }}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="flex items-center justify-between p-4 border-b border-[--color-sidebar-border]">
        <span className="flex items-center gap-2 font-bold text-lg">
          <Folder className="w-5 h-5" /> Project History
        </span>
        <button
          className="text-xl px-2 py-1 hover:bg-[--color-sidebar-accent] rounded"
          onClick={() => setOpen(false)}
          aria-label="Close sidebar"
        >
          ×
        </button>
      </div>
      <ul className="p-4 space-y-2 overflow-y-auto max-h-[calc(100vh-64px)] scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
        {projects.length === 0 ? (
          <li className="flex flex-col items-center justify-center h-40 text-gray-400 select-none">
            <FileText className="w-8 h-8 mb-2 opacity-60" />
            <span className="text-base font-medium">No projects found.</span>
          </li>
        ) : (
          projects.map((project) => (
            <motion.li
              key={project.id}
              className="p-2 rounded cursor-pointer flex items-center gap-2"
              whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.06)" }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <FileText className="w-4 h-4" />
              {project.description}
            </motion.li>
          ))
        )}
      </ul>
    </div>
  );
}
