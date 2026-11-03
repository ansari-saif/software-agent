import { describe, expect, it } from "vitest";
import {
  FakeModelProvider,
  buildSystemPrompt,
  repairToolPairs,
  runAgentLoop,
  trimConversationContext,
  validateToolRelativePath,
  type ConversationMessage,
  type EventSink,
  type SandboxClient,
} from "./index";

function createInMemorySandbox(): {
  sandbox: SandboxClient;
  files: Map<string, string>;
  preview: { port: number; path: string } | null;
} {
  const files = new Map<string, string>();
  let preview: { port: number; path: string } | null = null;

  const sandbox: SandboxClient = {
    async listFiles() {
      return Array.from(files.keys()).map((p) => ({
        path: p,
        type: "file" as const,
      }));
    },
    async readFile(relPath) {
      const val = files.get(relPath);
      if (val === undefined) throw new Error(`ENOENT: ${relPath}`);
      return val;
    },
    async searchFiles(query) {
      const results: Array<{ path: string; line: number; text: string }> = [];
      for (const [p, content] of files.entries()) {
        content.split("\n").forEach((lineText, i) => {
          if (lineText.includes(query)) {
            results.push({ path: p, line: i + 1, text: lineText });
          }
        });
      }
      return results;
    },
    async writeFile(relPath, content) {
      files.set(relPath, content);
    },
    async editFile(relPath, oldStr, newStr, replaceAll) {
      const existing = files.get(relPath);
      if (existing === undefined) throw new Error(`ENOENT: ${relPath}`);
      if (!existing.includes(oldStr)) {
        throw new Error("old_string not found");
      }
      const updated = replaceAll
        ? existing.split(oldStr).join(newStr)
        : existing.replace(oldStr, newStr);
      files.set(relPath, updated);
      return { replacements: 1 };
    },
    async deleteFile(relPath) {
      files.delete(relPath);
    },
    async runCommand(command) {
      return { exitCode: 0, stdout: `ran: ${command}`, stderr: "" };
    },
    async startProcess(input) {
      return { pid: 1234, name: input.name };
    },
    async stopProcess() {},
    async setPreview(input) {
      preview = { port: input.port, path: input.path || "/" };
      return {
        previewUrl: `https://preview.example.com${preview.path}`,
        port: preview.port,
        path: preview.path,
      };
    },
  };

  return {
    sandbox,
    files,
    get preview() {
      return preview;
    },
  };
}

describe("@repo/agent-core", () => {
  it("builds a generic system prompt with zero hardcoded stack mandates", () => {
    const prompt = buildSystemPrompt({
      fileTree: ["index.html", "style.css"],
      projectInstructions: "Use vanilla HTML and CSS.",
    });
    expect(prompt).toContain("autonomous software engineering agent");
    expect(prompt).toContain("index.html");
    expect(prompt).toContain("Use vanilla HTML and CSS.");
    expect(prompt).not.toContain("TanStack");
    expect(prompt).not.toContain("SQLModel");
    expect(prompt).not.toContain("TodoPage");
  });

  it("enforces path policy against traversal and .git modification", () => {
    expect(validateToolRelativePath("src/App.tsx").allowed).toBe(true);
    expect(validateToolRelativePath("../etc/passwd").allowed).toBe(false);
    expect(validateToolRelativePath("/etc/passwd").allowed).toBe(false);
    expect(validateToolRelativePath(".git/config").allowed).toBe(false);
    expect(validateToolRelativePath("a/../../b").allowed).toBe(false);
  });

  it("executes a multi-step tool loop, emits events, and registers preview", async () => {
    const mem = createInMemorySandbox();
    const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const events: EventSink = {
      async emit(type, payload) {
        emitted.push({ type, payload });
      },
    };

    const provider = new FakeModelProvider([
      {
        blocks: [
          { type: "text", text: "Creating index.html..." },
          {
            type: "tool_use",
            id: "tu_1",
            name: "write_file",
            input: { path: "index.html", content: "<h1>Hello World</h1>" },
          },
          {
            type: "tool_use",
            id: "tu_2",
            name: "set_preview",
            input: { port: 3000, path: "/" },
          },
        ],
        stopReason: "tool_use",
        inputTokens: 100,
        outputTokens: 50,
        costMicros: 1050,
      },
      {
        blocks: [{ type: "text", text: "Your landing page is live on port 3000." }],
        stopReason: "end_turn",
        inputTokens: 150,
        outputTokens: 30,
        costMicros: 900,
      },
    ]);

    const result = await runAgentLoop({
      projectId: "00000000-0000-0000-0000-000000000001",
      userId: "user_1",
      runId: "00000000-0000-0000-0000-000000000002",
      provider,
      sandbox: mem.sandbox,
      events,
      history: [
        {
          role: "USER",
          content: [{ type: "text", text: "Build a hello world landing page" }],
        },
      ],
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(result.stepsExecuted).toBe(2);
    expect(mem.files.get("index.html")).toBe("<h1>Hello World</h1>");
    expect(mem.preview).toEqual({ port: 3000, path: "/" });
    expect(emitted.some((e) => e.type === "file_changed")).toBe(true);
    expect(emitted.some((e) => e.type === "preview")).toBe(true);
    expect(emitted.at(-1)?.type).toBe("done");
  });

  it("enforces maxSteps cap and marks run FAILED when exceeded", async () => {
    const mem = createInMemorySandbox();
    const events: EventSink = { async emit() {} };
    const infiniteToolProvider = new FakeModelProvider(() => ({
      blocks: [
        {
          type: "tool_use",
          id: "tu_loop",
          name: "list_files",
          input: { path: "." },
        },
      ],
      stopReason: "tool_use",
      inputTokens: 20,
      outputTokens: 10,
      costMicros: 210,
    }));

    const result = await runAgentLoop({
      projectId: "00000000-0000-0000-0000-000000000001",
      userId: "user_1",
      runId: "00000000-0000-0000-0000-000000000002",
      provider: infiniteToolProvider,
      sandbox: mem.sandbox,
      events,
      history: [{ role: "USER", content: [{ type: "text", text: "loop" }] }],
      maxSteps: 3,
    });

    expect(result.status).toBe("FAILED");
    expect(result.stepsExecuted).toBe(3);
    expect(result.error).toMatch(/maximum step limit/i);
  });

  it("does not execute a tool call cut off by max_tokens and lets the model retry", async () => {
    const mem = createInMemorySandbox();
    const seenMessages: ConversationMessage[][] = [];
    const provider = new FakeModelProvider((turnInput, idx) => {
      seenMessages.push(turnInput.messages);
      if (idx === 0) {
        return {
          blocks: [
            { type: "tool_use", id: "tu_big", name: "write_file", input: { path: "app.js", content: "partial" } },
          ],
          stopReason: "max_tokens",
          inputTokens: 10,
          outputTokens: 8192,
          costMicros: 0,
        };
      }
      if (idx === 1) {
        return {
          blocks: [{ type: "tool_use", id: "tu_small", name: "write_file", input: { path: "app.js", content: "ok" } }],
          stopReason: "tool_use",
          inputTokens: 10,
          outputTokens: 10,
          costMicros: 0,
        };
      }
      return { blocks: [{ type: "text", text: "Done." }], stopReason: "end_turn", inputTokens: 1, outputTokens: 1, costMicros: 0 };
    });

    const result = await runAgentLoop({
      projectId: "00000000-0000-0000-0000-000000000001",
      userId: "user_1",
      runId: "00000000-0000-0000-0000-000000000002",
      provider,
      sandbox: mem.sandbox,
      events: { async emit() {} },
      history: [{ role: "USER", content: [{ type: "text", text: "build" }] }],
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(mem.files.get("app.js")).toBe("ok");
    const retryContext = seenMessages[1]!.at(-1)!;
    expect(retryContext.role).toBe("USER");
    expect(retryContext.content[0]).toMatchObject({ type: "tool_result", toolUseId: "tu_big", isError: true });
  });

  it("fails clearly after repeated max_tokens truncations", async () => {
    const provider = new FakeModelProvider(() => ({
      blocks: [{ type: "text", text: "very long..." }],
      stopReason: "max_tokens",
      inputTokens: 1,
      outputTokens: 100,
      costMicros: 0,
    }));
    const result = await runAgentLoop({
      projectId: "00000000-0000-0000-0000-000000000001",
      userId: "user_1",
      runId: "00000000-0000-0000-0000-000000000002",
      provider,
      sandbox: createInMemorySandbox().sandbox,
      events: { async emit() {} },
      history: [{ role: "USER", content: [{ type: "text", text: "build" }] }],
    });
    expect(result.status).toBe("FAILED");
    expect(result.stepsExecuted).toBe(3);
    expect(result.error).toMatch(/per-step limit/);
  });

  it("answers unanswered tool calls left in stored history", () => {
    const repaired = repairToolPairs([
      { role: "USER", content: [{ type: "text", text: "build" }] },
      { role: "ASSISTANT", content: [{ type: "tool_use", id: "tu_x", name: "write_file", input: {} }] },
      { role: "USER", content: [{ type: "text", text: "continue" }] },
    ]);
    expect(repaired).toHaveLength(3);
    expect(repaired[2]!.content[0]).toMatchObject({ type: "tool_result", toolUseId: "tu_x", isError: true });
    expect(repaired[2]!.content[1]).toMatchObject({ type: "text", text: "continue" });

    const trailing = repairToolPairs([
      { role: "ASSISTANT", content: [{ type: "tool_use", id: "tu_y", name: "list_files", input: {} }] },
    ]);
    expect(trailing.at(-1)).toMatchObject({ role: "USER", content: [{ type: "tool_result", toolUseId: "tu_y" }] });
  });

  it("trims bulky older tool results to stay within context budget", () => {
    const history: ConversationMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? ("USER" as const) : ("ASSISTANT" as const),
      content: [
        {
          type: "tool_result" as const,
          toolUseId: `tu_${i}`,
          name: "read_file",
          content: "x".repeat(5000),
        },
      ],
    }));

    const trimmed = trimConversationContext(history, {
      keepRecentTurnsWithFullTools: 2,
    });
    const firstBlock = trimmed[0]?.content[0];
    expect(firstBlock?.type).toBe("tool_result");
    if (firstBlock?.type === "tool_result") {
      expect(firstBlock.content).toContain("omitted from older turn");
    }
  });
});
