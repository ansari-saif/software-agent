"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Composer } from "@/components/Composer";
import { useCreateProject } from "@/hooks/useProjectMutations";
import { errorMessage } from "@/lib/api";

export function HomeComposer() {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const router = useRouter();
  const createProject = useCreateProject();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Composer
        variant="hero"
        label="Describe the app you want to build"
        placeholder="A habit tracker with streaks, reminders and a weekly summary chart…"
        submitLabel={isSignedIn || !isLoaded ? "Build" : "Sign in to build"}
        busy={creating}
        autoFocus
        onSubmit={async (payload) => {
          if (!isSignedIn) {
            clerk.openSignIn();
            return false;
          }
          setCreating(true);
          try {
            const { project } = await createProject(payload);
            router.push(`/project/${project.id}`);
            return true;
          } catch (err) {
            toast.error(errorMessage(err));
            setCreating(false);
            return false;
          }
        }}
      />
      <p role="status" aria-live="polite" className="sr-only">
        {creating ? "Creating your project…" : ""}
      </p>
    </>
  );
}
