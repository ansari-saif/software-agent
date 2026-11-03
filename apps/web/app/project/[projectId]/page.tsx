import { auth } from "@clerk/nextjs/server";
import { ProjectResponseSchema, type ProjectResponse } from "@repo/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/workspace/ProjectWorkspace";
import { API_V1_URL } from "@/lib/env";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Project" };

/**
 * Confirms the signed-in user owns the project before rendering. Returns null
 * when the API can't be reached so the client can recover and show its own error.
 */
async function loadOwnedProject(projectId: string): Promise<ProjectResponse | null> {
  const { getToken } = await auth();
  const token = await getToken();
  const base = process.env.API_INTERNAL_URL ? `${process.env.API_INTERNAL_URL.replace(/\/+$/, "")}/v1` : API_V1_URL;

  let res: Response;
  try {
    res = await fetch(`${base}/projects/${projectId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return null;
  }
  if (res.status === 404 || res.status === 403) notFound();
  if (!res.ok) return null;
  const parsed = ProjectResponseSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!UUID_RE.test(projectId)) notFound();
  const project = await loadOwnedProject(projectId);
  return <ProjectWorkspace key={projectId} projectId={projectId} initialProject={project ?? undefined} />;
}
