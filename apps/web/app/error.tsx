"use client";

import Link from "next/link";
import { StatusScreen } from "@/components/StatusScreen";
import { Button } from "@/components/ui/button";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusScreen
      title="Something went wrong"
      description={
        error.digest
          ? `An unexpected error occurred. Reference: ${error.digest}`
          : "An unexpected error occurred. Try again, or head back home."
      }
      actions={
        <>
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/">Go home</Link>
          </Button>
        </>
      }
    />
  );
}
