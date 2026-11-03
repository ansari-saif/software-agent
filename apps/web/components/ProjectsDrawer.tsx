"use client";

import type { ProjectResponse } from "@repo/contracts";
import { FolderOpen, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useProjectActions } from "@/hooks/useProjectMutations";
import { useProjects } from "@/hooks/useProjects";
import { errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ProjectsDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Open projects">
          <FolderOpen aria-hidden />
          <span className="hidden md:inline">Projects</span>
        </Button>
      </DialogTrigger>
      <DialogContent side="left" className="gap-0" aria-describedby="projects-desc">
        <div className="border-b px-4 py-4">
          <DialogTitle className="text-base">Projects</DialogTitle>
          <DialogDescription id="projects-desc" className="text-xs">
            Everything you&apos;ve built.
          </DialogDescription>
        </div>
        {open && <ProjectList onNavigate={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ProjectList({ onNavigate }: { onNavigate: () => void }) {
  const { projects, error, isLoading, isLoadingMore, hasMore, loadMore, mutate } = useProjects();

  if (isLoading) {
    return (
      <div role="status" className="flex flex-col gap-2 p-4">
        <span className="sr-only">Loading projects</span>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (error && projects.length === 0) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 p-4 text-sm">
        <p className="text-muted-foreground">{errorMessage(error)}</p>
        <Button variant="outline" size="sm" onClick={() => void mutate()}>
          Try again
        </Button>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-4 text-sm text-muted-foreground">
        <p>No projects yet. Describe an app on the home page to start one.</p>
        <Button asChild size="sm" className="self-start">
          <Link href="/" onClick={onNavigate}>
            New project
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <nav aria-label="Projects" className="min-h-0 flex-1 overflow-y-auto p-2">
      <ul className="flex flex-col gap-0.5">
        {projects.map((p) => (
          <ProjectRow key={p.id} project={p} onNavigate={onNavigate} />
        ))}
      </ul>
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          disabled={isLoadingMore}
          onClick={() => void loadMore()}
        >
          {isLoadingMore ? <Spinner label="Loading" /> : "Load more"}
        </Button>
      )}
    </nav>
  );
}

function ProjectRow({ project, onNavigate }: { project: ProjectResponse; onNavigate: () => void }) {
  const params = useParams<{ projectId?: string }>();
  const router = useRouter();
  const { remove } = useProjectActions(project.id);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isCurrent = params.projectId === project.id;

  async function handleDelete() {
    setDeleting(true);
    try {
      await remove();
      toast.success(`Deleted “${project.name}”`);
      if (isCurrent) {
        onNavigate();
        router.push("/");
      }
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <li className="group flex items-center gap-1 rounded-md hover:bg-accent focus-within:bg-accent">
      <Link
        href={`/project/${project.id}`}
        onClick={onNavigate}
        aria-current={isCurrent ? "page" : undefined}
        className={cn(
          "flex min-w-0 flex-1 flex-col rounded-md px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isCurrent && "text-primary"
        )}
      >
        <span className="truncate text-sm font-medium">{project.name}</span>
        <span className="text-xs text-muted-foreground">
          Updated {formatRelative(project.updatedAt)}
        </span>
      </Link>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-1 pr-1">
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            onClick={() => void handleDelete()}
            aria-label={`Confirm delete ${project.name}`}
          >
            {deleting ? <Spinner label="Deleting" /> : "Delete"}
          </Button>
          <Button variant="ghost" size="sm" disabled={deleting} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          className="mr-1 shrink-0 text-muted-foreground opacity-100 hover:text-destructive md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
          aria-label={`Delete ${project.name}`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden />
        </Button>
      )}
    </li>
  );
}
