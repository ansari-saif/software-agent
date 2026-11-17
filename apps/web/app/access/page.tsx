"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { AccessPanel } from "@/components/AccessPanel";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusScreen } from "@/components/StatusScreen";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useMe } from "@/hooks/useMe";
import { errorMessage } from "@/lib/api";

export default function AccessPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const me = useMe();

  if (!isLoaded || !isSignedIn || me.isLoading) {
    return (
      <div className="flex min-h-dvh flex-col bg-atmosphere">
        <SiteHeader className="border-transparent bg-transparent" />
        <main id="main" className="flex flex-1 items-center justify-center" role="status">
          <Spinner />
          <span className="sr-only">Loading access</span>
        </main>
      </div>
    );
  }

  if (me.error || !me.data) {
    return (
      <StatusScreen
        title="Couldn't check access"
        description={errorMessage(me.error)}
        actions={
          <Button asChild>
            <Link href="/">Back home</Link>
          </Button>
        }
      />
    );
  }

  if (me.data.role !== "superadmin") {
    return (
      <StatusScreen
        code="403"
        title="Forbidden"
        description="Only the superadmin can manage access."
        actions={
          <Button asChild>
            <Link href="/">Back home</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-atmosphere">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enable someone who asked, or add an email that never requested.
        </p>
        <div className="mt-8">
          <AccessPanel />
        </div>
      </main>
    </div>
  );
}
