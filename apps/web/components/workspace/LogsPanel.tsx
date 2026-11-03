import { Terminal } from "lucide-react";
import { PanelMessage } from "@/components/workspace/SandboxFrame";
import { truncate } from "@/lib/format";
import type { LogEntry } from "@/lib/runEvents";
import { cn } from "@/lib/utils";

export function LogsPanel({ logs }: { logs: LogEntry[] }) {
  if (logs.length === 0) {
    return (
      <PanelMessage icon={<Terminal className="size-6 text-muted-foreground" aria-hidden />} title="No commands yet">
        Commands the agent runs in the sandbox, with their output and exit codes, show up here.
      </PanelMessage>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <ol role="log" aria-label="Command output" className="flex flex-col gap-2 p-3">
        {logs.map((log, i) => (
          <li key={log.key}>
            <details open={i === logs.length - 1} className="rounded-lg border bg-surface text-xs">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="font-mono text-primary">$</span>
                <code className="min-w-0 flex-1 truncate font-mono">{log.command}</code>
                {log.cwd && log.cwd !== "." && (
                  <span className="hidden shrink-0 font-mono text-muted-foreground sm:inline">{log.cwd}</span>
                )}
                {log.timedOut ? (
                  <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 font-mono text-destructive">timed out</span>
                ) : log.exitCode !== null ? (
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 font-mono",
                      log.exitCode === 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                    )}
                  >
                    exit {log.exitCode}
                  </span>
                ) : log.isError ? (
                  <span className="shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 font-mono text-destructive">error</span>
                ) : null}
              </summary>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t bg-background p-3 font-mono text-[11px] leading-relaxed">
                {truncate(log.output, 50_000) || "(no output)"}
              </pre>
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}
