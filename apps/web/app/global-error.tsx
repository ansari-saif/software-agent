"use client";

import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }}>
      <body>
        <main className="flex min-h-dvh items-center justify-center px-4">
          <div className="max-w-md text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
            <p className="mt-3 text-muted-foreground">
              The app failed to load.{error.digest ? ` Reference: ${error.digest}` : ""}
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-8 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
