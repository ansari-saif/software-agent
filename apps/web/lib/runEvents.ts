import type { RunEvent, RunStatus } from "@repo/contracts";

export type LiveItem =
  | { kind: "text"; key: string; text: string }
  | {
      kind: "tool";
      key: string;
      toolUseId: string;
      name: string;
      input: Record<string, unknown>;
      result?: { content: string; isError: boolean };
      exitCode?: number | null;
    }
  | { kind: "file"; key: string; action: string; path: string }
  | { kind: "preview"; key: string; port: number | null; path: string | null }
  | { kind: "error"; key: string; message: string };

export interface LogEntry {
  key: string;
  command: string;
  cwd: string | null;
  exitCode: number | null;
  output: string;
  isError: boolean;
  timedOut: boolean;
}

export interface LiveRunState {
  items: LiveItem[];
  logs: LogEntry[];
  status: RunStatus | null;
  model: string | null;
  finalError: string | null;
  lastSeq: number;
}

export const initialLiveRunState: LiveRunState = {
  items: [],
  logs: [],
  status: null,
  model: null,
  finalError: null,
  lastSeq: -1,
};

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const RUN_STATUSES: readonly RunStatus[] = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"];
const asStatus = (v: unknown): RunStatus | null =>
  RUN_STATUSES.includes(v as RunStatus) ? (v as RunStatus) : null;

const COMMAND_TOOLS = new Set(["run_command", "start_process"]);

/** Folds one SSE run event into the live view. Events at or below `lastSeq` are ignored. */
export function applyRunEvent(state: LiveRunState, event: RunEvent): LiveRunState {
  if (event.seq <= state.lastSeq) return state;
  const p = event.payload;
  const key = `${event.runId}:${event.seq}`;
  const next: LiveRunState = { ...state, lastSeq: event.seq };

  switch (event.type) {
    case "status":
      next.status = asStatus(p.status) ?? state.status;
      next.model = str(p.model) ?? state.model;
      return next;

    case "text_delta": {
      const delta = str(p.text) ?? "";
      if (!delta) return next;
      const last = state.items[state.items.length - 1];
      next.items =
        last?.kind === "text"
          ? [...state.items.slice(0, -1), { ...last, text: last.text + delta }]
          : [...state.items, { kind: "text", key, text: delta }];
      return next;
    }

    case "tool_call":
      next.items = [
        ...state.items,
        {
          kind: "tool",
          key,
          toolUseId: str(p.toolUseId) ?? key,
          name: str(p.name) ?? "tool",
          input: record(p.input),
        },
      ];
      return next;

    case "tool_result": {
      const toolUseId = str(p.toolUseId);
      const result = { content: str(p.content) ?? "", isError: p.isError === true };
      const idx = state.items.findIndex((i) => i.kind === "tool" && i.toolUseId === toolUseId);
      if (idx === -1) {
        next.items = [
          ...state.items,
          { kind: "tool", key, toolUseId: toolUseId ?? key, name: str(p.name) ?? "tool", input: {}, result },
        ];
      } else {
        next.items = state.items.map((item, i) => (i === idx && item.kind === "tool" ? { ...item, result } : item));
      }
      return next;
    }

    case "command_output": {
      const exitCode = num(p.exitCode);
      const stdout = str(p.stdout) ?? "";
      const stderr = str(p.stderr) ?? "";
      next.logs = [
        ...state.logs,
        {
          key,
          command: str(p.command) ?? "",
          cwd: str(p.cwd),
          exitCode,
          output: [stdout, stderr].filter(Boolean).join("\n"),
          isError: (exitCode !== null && exitCode !== 0) || p.timedOut === true,
          timedOut: p.timedOut === true,
        },
      ];
      // Attach the exit code to the most recent pending command tool card.
      for (let i = state.items.length - 1; i >= 0; i--) {
        const item = state.items[i];
        if (item?.kind === "tool" && COMMAND_TOOLS.has(item.name) && item.exitCode === undefined) {
          next.items = state.items.map((it, j) => (j === i && it.kind === "tool" ? { ...it, exitCode } : it));
          break;
        }
      }
      return next;
    }

    case "file_changed":
      next.items = [
        ...state.items,
        { kind: "file", key, action: str(p.action) ?? "change", path: str(p.path) ?? "" },
      ];
      return next;

    case "preview":
      next.items = [...state.items, { kind: "preview", key, port: num(p.port), path: str(p.path) }];
      return next;

    case "error":
      next.items = [...state.items, { kind: "error", key, message: str(p.message) ?? "The agent hit an error." }];
      return next;

    case "done":
      next.status = asStatus(p.status) ?? "SUCCEEDED";
      next.finalError = str(p.error);
      return next;
  }
}

export function isActiveStatus(status: RunStatus | null | undefined): boolean {
  return status === "QUEUED" || status === "RUNNING";
}
