import type { ImageBlock, MessageResponse, Role, ToolResultBlock } from "@repo/contracts";
import type { LogEntry } from "@/lib/runEvents";

export type ChatBlock =
  | { kind: "text"; key: string; text: string }
  | { kind: "image"; key: string; image: ImageBlock }
  | {
      kind: "tool";
      key: string;
      name: string;
      input: Record<string, unknown>;
      result?: { content: string; isError: boolean };
    };

export interface ChatEntry {
  key: string;
  role: Role;
  blocks: ChatBlock[];
  optimistic: boolean;
}

const COMMAND_TOOLS = new Set(["run_command", "start_process"]);

function resultsById(messages: MessageResponse[]): Map<string, ToolResultBlock> {
  const map = new Map<string, ToolResultBlock>();
  for (const m of messages) {
    for (const b of m.content) if (b.type === "tool_result") map.set(b.toolUseId, b);
  }
  return map;
}

/**
 * Turns persisted messages into chat bubbles. Tool results are attached to the
 * tool call that produced them, so tool-result-only USER turns disappear.
 * Messages belonging to `liveRunId` are omitted because the live stream renders them.
 */
export function buildChatEntries(messages: MessageResponse[], liveRunId?: string | null): ChatEntry[] {
  const results = resultsById(messages);
  const toolUseIds = new Set<string>();
  for (const m of messages) for (const b of m.content) if (b.type === "tool_use") toolUseIds.add(b.id);

  const entries: ChatEntry[] = [];
  for (const m of messages) {
    if (liveRunId && m.runId === liveRunId && m.role === "ASSISTANT") continue;
    const blocks: ChatBlock[] = [];
    m.content.forEach((b, i) => {
      const key = `${m.id}:${i}`;
      switch (b.type) {
        case "text":
          if (b.text.trim()) blocks.push({ kind: "text", key, text: b.text });
          break;
        case "image":
          blocks.push({ kind: "image", key, image: b });
          break;
        case "tool_use": {
          const r = results.get(b.id);
          blocks.push({
            kind: "tool",
            key,
            name: b.name,
            input: b.input,
            result: r ? { content: r.content, isError: r.isError === true } : undefined,
          });
          break;
        }
        case "tool_result":
          if (!toolUseIds.has(b.toolUseId)) {
            blocks.push({
              kind: "tool",
              key,
              name: b.name,
              input: {},
              result: { content: b.content, isError: b.isError === true },
            });
          }
          break;
      }
    });
    if (blocks.length === 0) continue;
    entries.push({ key: m.id, role: m.role, blocks, optimistic: m.id.startsWith("optimistic-") });
  }
  return entries;
}

/** Command history reconstructed from persisted tool calls. */
export function deriveCommandLogs(messages: MessageResponse[]): LogEntry[] {
  const results = resultsById(messages);
  const logs: LogEntry[] = [];
  for (const m of messages) {
    for (const b of m.content) {
      if (b.type !== "tool_use" || !COMMAND_TOOLS.has(b.name)) continue;
      const r = results.get(b.id);
      const command = typeof b.input.command === "string" ? b.input.command : b.name;
      logs.push({
        key: b.id,
        command: b.name === "start_process" ? `[start_process] ${command}` : command,
        cwd: typeof b.input.cwd === "string" ? b.input.cwd : null,
        exitCode: null,
        output: r?.content ?? "",
        isError: r?.isError === true,
        timedOut: false,
      });
    }
  }
  return logs;
}
