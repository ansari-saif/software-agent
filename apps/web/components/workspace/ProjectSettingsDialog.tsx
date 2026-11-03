"use client";

import type { ProjectResponse } from "@repo/contracts";
import { Download, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useProjectActions } from "@/hooks/useProjectMutations";
import { errorMessage } from "@/lib/api";
import { slugify } from "@/lib/format";

export function ProjectSettingsDialog({ project }: { project: ProjectResponse }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Project settings">
          <Settings aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent>
        {open && <SettingsForm project={project} onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({ project, onClose }: { project: ProjectResponse; onClose: () => void }) {
  const router = useRouter();
  const { update, remove, exportArchive } = useProjectActions(project.id);
  const [name, setName] = useState(project.name);
  const [instructions, setInstructions] = useState(project.instructions ?? "");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const trimmedName = name.trim();
  const dirty = trimmedName !== project.name || instructions.trim() !== (project.instructions ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmedName || !dirty) return;
    setSaving(true);
    try {
      await update({ name: trimmedName, instructions: instructions.trim() || null });
      toast.success("Project saved");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportArchive(`${slugify(project.name)}.tar.gz`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await remove();
      toast.success(`Deleted “${project.name}”`);
      onClose();
      router.push("/");
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Project settings</DialogTitle>
        <DialogDescription>Rename the project or give the agent standing instructions.</DialogDescription>
      </DialogHeader>

      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="project-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="project-name"
            value={name}
            maxLength={120}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="project-instructions" className="text-sm font-medium">
            Instructions for the agent
          </label>
          <Textarea
            id="project-instructions"
            value={instructions}
            maxLength={10_000}
            rows={5}
            aria-describedby="project-instructions-hint"
            placeholder="e.g. Use TypeScript and Tailwind. Keep the UI accessible."
            onChange={(e) => setInstructions(e.target.value)}
          />
          <p id="project-instructions-hint" className="text-xs text-muted-foreground">
            Applied to every run in this project.
          </p>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={!dirty || !trimmedName || saving}>
            {saving && <Spinner />} Save changes
          </Button>
        </DialogFooter>
      </form>

      <div className="flex flex-col gap-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Export</p>
            <p className="text-xs text-muted-foreground">Download the workspace as a .tar.gz archive.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? <Spinner /> : <Download aria-hidden />} Export
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 p-3">
          <div>
            <p className="text-sm font-medium">Delete project</p>
            <p className="text-xs text-muted-foreground">Removes the conversation, files and sandbox. This can&apos;t be undone.</p>
          </div>
          {confirmDelete ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void handleDelete()} disabled={deleting}>
                {deleting && <Spinner />} Delete forever
              </Button>
            </div>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
