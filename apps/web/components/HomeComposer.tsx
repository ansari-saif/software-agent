"use client";

import { useAuth } from "@clerk/nextjs";
import { AccessOkResponseSchema } from "@repo/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Composer } from "@/components/Composer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useApi } from "@/hooks/useApi";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";
import { useMe } from "@/hooks/useMe";
import { useCreateProject } from "@/hooks/useProjectMutations";
import { errorMessage } from "@/lib/api";

export function HomeComposer() {
  const { isLoaded, isSignedIn } = useAuth();
  const me = useMe();
  const google = useGoogleSignIn();

  if (!isLoaded) {
    return (
      <Composer
        variant="hero"
        label="Describe the app you want to build"
        placeholder="A habit tracker with streaks, reminders and a weekly summary chart…"
        submitLabel="Build"
        sendDisabled
        onSubmit={async () => false}
      />
    );
  }

  if (!isSignedIn) {
    return (
      <Composer
        variant="hero"
        label="Describe the app you want to build"
        placeholder="A habit tracker with streaks, reminders and a weekly summary chart…"
        submitLabel="Continue with Google"
        busy={google.busy}
        sendDisabled={!google.ready}
        allowEmptySubmit
        autoFocus
        onSubmit={async () => {
          await google.start();
          return false;
        }}
      />
    );
  }

  if (me.isLoading) {
    return (
      <div
        role="status"
        className="flex min-h-[148px] items-center gap-3 rounded-2xl border bg-surface/90 px-4 shadow-2xl shadow-black/40"
      >
        <Spinner />
        <span className="text-sm text-muted-foreground">Checking access…</span>
      </div>
    );
  }

  if (me.error || !me.data) {
    return <p className="text-sm text-destructive">{errorMessage(me.error)}</p>;
  }

  if (me.data.role === "none") {
    return <RequestAccess email={me.data.email} onRequested={() => void me.mutate()} />;
  }

  if (me.data.role === "pending") {
    return (
      <div className="rounded-2xl border bg-surface/90 px-5 py-6 shadow-2xl shadow-black/40">
        <p className="text-sm text-muted-foreground">{me.data.email}</p>
        <p className="mt-2 text-xl font-semibold tracking-tight">Waiting for Saif</p>
      </div>
    );
  }

  return <BuildComposer />;
}

function RequestAccess({ email, onRequested }: { email: string; onRequested: () => void }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-2xl border bg-surface/90 px-5 py-6 shadow-2xl shadow-black/40">
      <p className="text-sm text-muted-foreground">{email}</p>
      <Button
        className="mt-4"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void api
            .request("/access/request", { method: "POST", schema: AccessOkResponseSchema })
            .then(() => onRequested())
            .catch((err: unknown) => {
              toast.error(errorMessage(err));
              setBusy(false);
            });
        }}
      >
        {busy ? <Spinner label="Requesting access" /> : null}
        Request access
      </Button>
    </div>
  );
}

function BuildComposer() {
  const router = useRouter();
  const createProject = useCreateProject();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Composer
        variant="hero"
        label="Describe the app you want to build"
        placeholder="A habit tracker with streaks, reminders and a weekly summary chart…"
        submitLabel="Build"
        busy={creating}
        autoFocus
        onSubmit={async (payload) => {
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
