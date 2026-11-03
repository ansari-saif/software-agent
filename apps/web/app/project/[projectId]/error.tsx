"use client";

import Link from "next/link";
import { StatusScreen } from "@/components/StatusScreen";
import { Button } from "@/components/ui/button";

export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusScreen
      title="This project failed to load"
      description={
        error.digest
          ? `Your work is safe. Reload to try again. Reference: ${error.digest}`
          : "Your work is safe. Reload to try again."
      }
      actions={
        <>
          <Button onClick={reset}>Reload project</Button>
          <Button asChild variant="outline">
            <Link href="/">All projects</Link>
          </Button>
        </>
      }
    />
  );
}
