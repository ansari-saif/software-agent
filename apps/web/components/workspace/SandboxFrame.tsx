"use client";

import { AlertTriangle, ExternalLink, RotateCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function PanelMessage({
  icon,
  title,
  children,
  action,
  busy,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <div
      role={busy ? "status" : undefined}
      className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
    >
      {busy ? <Spinner className="size-6 text-muted-foreground" /> : icon}
      <div className="max-w-sm">
        <p className="text-sm font-medium">{title}</p>
        {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
      </div>
      {action}
    </div>
  );
}

export function SandboxError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <PanelMessage
      icon={<AlertTriangle className="size-6 text-warning" aria-hidden />}
      title="The sandbox isn't available"
      action={
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {message}
    </PanelMessage>
  );
}

function stripQuery(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

/** Cross-origin sandbox iframe with a load overlay and optional toolbar. */
export function SandboxFrame({
  src,
  title,
  sandbox,
  allow,
  toolbar = false,
  reloadKey = 0,
  onReload,
}: {
  src: string;
  title: string;
  sandbox?: string;
  allow?: string;
  toolbar?: boolean;
  reloadKey?: number;
  onReload?: () => void;
}) {
  // Signed URLs rotate on session refresh; only reload the frame when the
  // target itself changes or a reload is requested, so in-frame state survives.
  const base = stripQuery(src);
  const [frame, setFrame] = useState({ base, src, reloadKey });
  if (frame.base !== base || frame.reloadKey !== reloadKey) {
    setFrame({ base, src, reloadKey });
  }
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const frameKey = `${frame.src}#${frame.reloadKey}`;
  const loaded = loadedKey === frameKey;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbar && (
        <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
          <Button variant="ghost" size="icon-sm" aria-label="Reload preview" onClick={onReload}>
            <RotateCw aria-hidden />
          </Button>
          <p className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
            {frame.base}
          </p>
          <Button asChild variant="ghost" size="icon-sm">
            <a href={src} target="_blank" rel="noopener noreferrer" aria-label="Open preview in a new tab">
              <ExternalLink aria-hidden />
            </a>
          </Button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {!loaded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
            <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading {title.toLowerCase()}…
            </div>
          </div>
        )}
        <iframe
          key={frameKey}
          src={frame.src}
          title={title}
          sandbox={sandbox}
          allow={allow}
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedKey(frameKey)}
          className="absolute inset-0 h-full w-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
