"use client";

import dynamic from "next/dynamic";

const ProjectHistorySidebar = dynamic(
  () => import("./ProjectHistorySidebar"),
  { ssr: false }
);

export default function ClientSidebar() {
  return <ProjectHistorySidebar />;
}

