import type { ContentBlock, RunEventType } from "@repo/contracts";
import type { z } from "zod";

export interface ConversationMessage {
  role: "USER" | "ASSISTANT";
  content: ContentBlock[];
}

export interface SandboxFileEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
}

export interface SandboxSearchMatch {
  path: string;
  line: number;
  text: string;
}

export interface SandboxExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export interface SandboxClient {
  listFiles(relPath?: string): Promise<SandboxFileEntry[]>;
  readFile(relPath: string): Promise<string>;
  searchFiles(query: string, relPath?: string): Promise<SandboxSearchMatch[]>;
  writeFile(relPath: string, content: string): Promise<void>;
  editFile(
    relPath: string,
    oldString: string,
    newString: string,
    replaceAll?: boolean
  ): Promise<{ replacements: number }>;
  deleteFile(relPath: string): Promise<void>;
  runCommand(
    command: string,
    options?: { cwd?: string; timeoutMs?: number }
  ): Promise<SandboxExecResult>;
  startProcess(input: {
    name: string;
    command: string;
    cwd?: string;
    port?: number;
  }): Promise<{ pid?: number; name: string }>;
  stopProcess(name: string): Promise<void>;
  setPreview(input: { port: number; path?: string }): Promise<{
    previewUrl: string | null;
    port: number;
    path: string;
  }>;
}

export interface EventSink {
  emit(type: RunEventType, payload: Record<string, unknown>): Promise<void>;
}

export interface ToolContext {
  projectId: string;
  userId: string;
  runId: string;
  sandbox: SandboxClient;
  events: EventSink;
  signal?: AbortSignal;
}

export interface ToolJsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  jsonSchema: ToolJsonSchema;
  policy?: (input: TInput) => { allowed: boolean; reason?: string };
  handler: (ctx: ToolContext, input: TInput) => Promise<string>;
}

export interface ModelTurnInput {
  systemPrompt: string;
  messages: ConversationMessage[];
  tools: Array<{
    name: string;
    description: string;
    inputSchema: ToolJsonSchema;
  }>;
  maxTokens: number;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => Promise<void> | void;
}

export interface ModelTurnOutput {
  blocks: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
}

export interface ModelProvider {
  readonly modelId: string;
  streamTurn(input: ModelTurnInput): Promise<ModelTurnOutput>;
}
