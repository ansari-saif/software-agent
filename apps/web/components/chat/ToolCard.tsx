import {
  AlertTriangle,
  BookOpen,
  Check,
  Eye,
  FilePen,
  FileText,
  FolderTree,
  Play,
  Search,
  Square,
  Terminal,
  Trash2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { truncate } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  list_files: FolderTree,
  read_file: FileText,
  search_files: Search,
  write_file: FilePen,
  edit_file: FilePen,
  delete_file: Trash2,
  run_command: Terminal,
  start_process: Play,
  stop_process: Square,
  set_preview: Eye,
  read_guide: BookOpen,
};

/** Fields shown inline in the card header; everything else goes in the details. */
const SUMMARY_FIELDS = ["command", "path", "query", "name", "port"] as const;
const HIDDEN_INPUT_FIELDS = new Set(["content", "old_string", "new_string"]);

function humanize(name: string): string {
  const s = name.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function summarizeToolInput(input: Record<string, unknown>): string | null {
  for (const field of SUMMARY_FIELDS) {
    const v = input[field];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return field === "port" ? `:${v}` : String(v);
  }
  return null;
}

function inputDetails(input: Record<string, unknown>): string | null {
  const entries = Object.entries(input).filter(([k]) => !HIDDEN_INPUT_FIELDS.has(k));
  const hasExtra = entries.some(([k]) => !(SUMMARY_FIELDS as readonly string[]).includes(k));
  if (!hasExtra) return null;
  return truncate(JSON.stringify(Object.fromEntries(entries), null, 2), 4_000);
}

export interface ToolCardProps {
  name: string;
  input: Record<string, unknown>;
  result?: { content: string; isError: boolean };
  exitCode?: number | null;
  pending?: boolean;
}

export function ToolCard({ name, input, result, exitCode, pending = false }: ToolCardProps) {
  const Icon = ICONS[name] ?? Wrench;
  const summary = summarizeToolInput(input);
  const details = inputDetails(input);
  const failed = result?.isError || (exitCode !== undefined && exitCode !== null && exitCode !== 0);
  const content = typeof input.content === "string" ? input.content : null;

  return (
    <details
      className={cn(
        "group rounded-lg border bg-surface text-xs open:bg-surface-raised",
        failed && "border-destructive/50"
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Icon className={cn("size-3.5 shrink-0", failed ? "text-destructive" : "text-muted-foreground")} aria-hidden />
        <span className="shrink-0 font-medium">{humanize(name)}</span>
        {summary && (
          <code className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{summary}</code>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {exitCode !== undefined && exitCode !== null && (
            <span className={cn("font-mono", exitCode === 0 ? "text-muted-foreground" : "text-destructive")}>
              exit {exitCode}
            </span>
          )}
          {pending && !result ? (
            <Spinner className="size-3.5 text-muted-foreground" label="Running" />
          ) : failed ? (
            <>
              <AlertTriangle className="size-3.5 text-destructive" aria-hidden />
              <span className="sr-only">Failed</span>
            </>
          ) : result ? (
            <>
              <Check className="size-3.5 text-success" aria-hidden />
              <span className="sr-only">Done</span>
            </>
          ) : null}
        </span>
      </summary>
      <div className="flex flex-col gap-2 border-t px-3 py-2">
        {details && <OutputBlock label="Input" text={details} />}
        {content !== null && <OutputBlock label="Content" text={truncate(content, 4_000)} />}
        {result ? (
          <OutputBlock
            label={failed ? "Error" : "Output"}
            text={truncate(result.content, 20_000) || "(no output)"}
            error={failed}
          />
        ) : (
          <p className="text-muted-foreground">{pending ? "Waiting for output…" : "No output recorded."}</p>
        )}
      </div>
    </details>
  );
}

function OutputBlock({ label, text, error }: { label: string; text: string; error?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <pre
        className={cn(
          "max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-2 font-mono text-[11px] leading-relaxed",
          error && "border-destructive/40 text-destructive"
        )}
      >
        {text}
      </pre>
    </div>
  );
}
