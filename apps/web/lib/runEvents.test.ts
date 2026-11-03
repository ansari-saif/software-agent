import type { MessageResponse, RunEvent } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { buildChatEntries, deriveCommandLogs } from "./messages";
import { applyRunEvent, initialLiveRunState, type LiveRunState } from "./runEvents";

const RUN = "00000000-0000-4000-8000-000000000001";
let seq = 0;
function ev(type: RunEvent["type"], payload: Record<string, unknown>): RunEvent {
  seq += 1;
  return { id: `e${seq}`, runId: RUN, seq, type, payload, createdAt: new Date().toISOString() };
}
const fold = (events: RunEvent[]): LiveRunState => events.reduce(applyRunEvent, initialLiveRunState);

describe("applyRunEvent", () => {
  it("merges consecutive text deltas and pairs tool calls with results", () => {
    const state = fold([
      ev("status", { status: "RUNNING", model: "m" }),
      ev("text_delta", { text: "Hel" }),
      ev("text_delta", { text: "lo" }),
      ev("tool_call", { toolUseId: "t1", name: "run_command", input: { command: "ls" } }),
      ev("command_output", { command: "ls", cwd: ".", exitCode: 2, stdout: "a", stderr: "b" }),
      ev("tool_result", { toolUseId: "t1", name: "run_command", content: "a\nb", isError: false }),
      ev("done", { status: "SUCCEEDED" }),
    ]);
    expect(state.status).toBe("SUCCEEDED");
    expect(state.model).toBe("m");
    expect(state.items).toHaveLength(2);
    expect(state.items[0]).toMatchObject({ kind: "text", text: "Hello" });
    expect(state.items[1]).toMatchObject({ kind: "tool", exitCode: 2, result: { content: "a\nb" } });
    expect(state.logs[0]).toMatchObject({ command: "ls", exitCode: 2, output: "a\nb", isError: true });
  });

  it("ignores replayed events at or below the last sequence", () => {
    const first = ev("text_delta", { text: "x" });
    const state = [first, first].reduce(applyRunEvent, initialLiveRunState);
    expect(state.items).toEqual([{ kind: "text", key: `${RUN}:${first.seq}`, text: "x" }]);
  });
});

describe("buildChatEntries", () => {
  const base = { projectId: RUN, createdAt: "2026-01-01T00:00:00Z" };
  const messages: MessageResponse[] = [
    { ...base, id: "m1", runId: RUN, role: "USER", content: [{ type: "text", text: "build it" }] },
    {
      ...base,
      id: "m2",
      runId: RUN,
      role: "ASSISTANT",
      content: [{ type: "tool_use", id: "t1", name: "run_command", input: { command: "npm i" } }],
    },
    {
      ...base,
      id: "m3",
      runId: RUN,
      role: "USER",
      content: [{ type: "tool_result", toolUseId: "t1", name: "run_command", content: "ok" }],
    },
  ];

  it("attaches tool results to their call and hides tool-result-only user turns", () => {
    const entries = buildChatEntries(messages);
    expect(entries.map((e) => e.key)).toEqual(["m1", "m2"]);
    expect(entries[1]?.blocks[0]).toMatchObject({ kind: "tool", result: { content: "ok", isError: false } });
  });

  it("omits assistant output of the run being streamed live", () => {
    expect(buildChatEntries(messages, RUN).map((e) => e.key)).toEqual(["m1"]);
  });

  it("derives command logs from persisted tool calls", () => {
    expect(deriveCommandLogs(messages)).toMatchObject([{ command: "npm i", output: "ok" }]);
  });
});
