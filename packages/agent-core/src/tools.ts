import path from "path";
import { z } from "zod";
import { getGuideContent, listGuideNames } from "./knowledge";
import type { ToolContext, ToolDefinition } from "./types";

const MAX_MODEL_COMMAND_OUTPUT_CHARS = 8_000;
const MAX_MODEL_FILE_READ_CHARS = 60_000;

export function validateToolRelativePath(relPath: string): {
  allowed: boolean;
  reason?: string;
} {
  if (!relPath || typeof relPath !== "string") {
    return { allowed: false, reason: "Path must be a non-empty string" };
  }
  if (relPath.includes("\0")) {
    return { allowed: false, reason: "Path must not contain null bytes" };
  }
  if (path.isAbsolute(relPath) || relPath.startsWith("~")) {
    return { allowed: false, reason: "Path must be relative to workspace root" };
  }
  const normalized = path.posix.normalize(relPath.replace(/\\/g, "/"));
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    return {
      allowed: false,
      reason: "Path traversal outside workspace root is forbidden",
    };
  }
  if (
    normalized === ".git" ||
    normalized.startsWith(".git/") ||
    normalized.includes("/.git/")
  ) {
    return {
      allowed: false,
      reason: "Direct modification or access to .git internals is forbidden",
    };
  }
  return { allowed: true };
}

function capForModel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  return (
    text.slice(0, half) +
    `\n...[truncated ${text.length - maxChars} characters for model context]...\n` +
    text.slice(-half)
  );
}

const ListFilesInputSchema = z.object({
  path: z.string().max(1024).optional().default("."),
});

const ReadFileInputSchema = z.object({
  path: z.string().min(1).max(1024),
});

const SearchFilesInputSchema = z.object({
  query: z.string().min(1).max(500),
  path: z.string().max(1024).optional().default("."),
});

const WriteFileInputSchema = z.object({
  path: z.string().min(1).max(1024),
  content: z.string().max(5_000_000),
});

const EditFileInputSchema = z.object({
  path: z.string().min(1).max(1024),
  old_string: z.string().min(1),
  new_string: z.string(),
  replace_all: z.boolean().optional().default(false),
});

const DeleteFileInputSchema = z.object({
  path: z.string().min(1).max(1024),
});

const RunCommandInputSchema = z.object({
  command: z.string().min(1).max(10_000),
  cwd: z.string().max(1024).optional().default("."),
  timeout_ms: z
    .number()
    .int()
    .min(1000)
    .max(300_000)
    .optional()
    .default(120_000),
});

const StartProcessInputSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
  command: z.string().min(1).max(10_000),
  cwd: z.string().max(1024).optional().default("."),
  port: z.number().int().min(1024).max(65535).optional(),
});

const StopProcessInputSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
});

const SetPreviewInputSchema = z.object({
  port: z.number().int().min(1024).max(65535),
  path: z.string().max(500).optional().default("/"),
});

const ReadGuideInputSchema = z.object({
  name: z.string().min(1).max(100),
});

export function createDefaultTools(): ToolDefinition<any>[] {
  const listFilesTool: ToolDefinition<z.infer<typeof ListFilesInputSchema>> = {
    name: "list_files",
    description:
      "List files and directories inside the workspace at the given relative path.",
    inputSchema: ListFilesInputSchema,
    jsonSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative directory path (defaults to '.')",
        },
      },
    },
    policy: (input) => validateToolRelativePath(input.path || "."),
    handler: async (ctx, input) => {
      const entries = await ctx.sandbox.listFiles(input.path);
      if (entries.length === 0) {
        return "(directory is empty)";
      }
      return entries
        .map((e) => `${e.type === "directory" ? "[dir] " : "      "}${e.path}`)
        .join("\n");
    },
  };

  const readFileTool: ToolDefinition<z.infer<typeof ReadFileInputSchema>> = {
    name: "read_file",
    description: "Read the text contents of a file in the workspace.",
    inputSchema: ReadFileInputSchema,
    jsonSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path to read" },
      },
      required: ["path"],
    },
    policy: (input) => validateToolRelativePath(input.path),
    handler: async (ctx, input) => {
      const content = await ctx.sandbox.readFile(input.path);
      return capForModel(content, MAX_MODEL_FILE_READ_CHARS);
    },
  };

  const searchFilesTool: ToolDefinition<z.infer<typeof SearchFilesInputSchema>> =
    {
      name: "search_files",
      description:
        "Search for a text or regex pattern across files in the workspace.",
      inputSchema: SearchFilesInputSchema,
      jsonSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Pattern to search for" },
          path: {
            type: "string",
            description: "Optional subdirectory to scope the search",
          },
        },
        required: ["query"],
      },
      policy: (input) => validateToolRelativePath(input.path || "."),
      handler: async (ctx, input) => {
        const matches = await ctx.sandbox.searchFiles(input.query, input.path);
        if (matches.length === 0) return "No matches found.";
        return capForModel(
          matches.map((m) => `${m.path}:${m.line}: ${m.text}`).join("\n"),
          MAX_MODEL_COMMAND_OUTPUT_CHARS
        );
      },
    };

  const writeFileTool: ToolDefinition<z.infer<typeof WriteFileInputSchema>> = {
    name: "write_file",
    description:
      "Create or overwrite a file in the workspace with complete contents. Parent directories are created automatically.",
    inputSchema: WriteFileInputSchema,
    jsonSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path" },
        content: { type: "string", description: "Complete file contents" },
      },
      required: ["path", "content"],
    },
    policy: (input) => validateToolRelativePath(input.path),
    handler: async (ctx, input) => {
      await ctx.sandbox.writeFile(input.path, input.content);
      await ctx.events.emit("file_changed", {
        action: "write",
        path: input.path,
        bytes: Buffer.byteLength(input.content, "utf-8"),
      });
      return `Wrote ${input.path} (${Buffer.byteLength(input.content, "utf-8")} bytes)`;
    },
  };

  const editFileTool: ToolDefinition<z.infer<typeof EditFileInputSchema>> = {
    name: "edit_file",
    description:
      "Perform an exact string replacement inside an existing file in the workspace.",
    inputSchema: EditFileInputSchema,
    jsonSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path" },
        old_string: {
          type: "string",
          description: "Exact existing text to replace",
        },
        new_string: { type: "string", description: "Replacement text" },
        replace_all: {
          type: "boolean",
          description: "Replace all occurrences instead of requiring uniqueness",
        },
      },
      required: ["path", "old_string", "new_string"],
    },
    policy: (input) => validateToolRelativePath(input.path),
    handler: async (ctx, input) => {
      const res = await ctx.sandbox.editFile(
        input.path,
        input.old_string,
        input.new_string,
        input.replace_all
      );
      await ctx.events.emit("file_changed", {
        action: "edit",
        path: input.path,
        replacements: res.replacements,
      });
      return `Updated ${input.path} (${res.replacements} replacement(s))`;
    },
  };

  const deleteFileTool: ToolDefinition<z.infer<typeof DeleteFileInputSchema>> =
    {
      name: "delete_file",
      description: "Delete a file in the workspace.",
      inputSchema: DeleteFileInputSchema,
      jsonSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path to delete" },
        },
        required: ["path"],
      },
      policy: (input) => validateToolRelativePath(input.path),
      handler: async (ctx, input) => {
        await ctx.sandbox.deleteFile(input.path);
        await ctx.events.emit("file_changed", {
          action: "delete",
          path: input.path,
        });
        return `Deleted ${input.path}`;
      },
    };

  const runCommandTool: ToolDefinition<z.infer<typeof RunCommandInputSchema>> =
    {
      name: "run_command",
      description:
        "Execute a non-interactive shell command inside the project sandbox (e.g. installing dependencies, running tests or builds). Do not use this for long-running dev servers; use start_process instead.",
      inputSchema: RunCommandInputSchema,
      jsonSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          cwd: {
            type: "string",
            description: "Relative working directory inside workspace",
          },
          timeout_ms: {
            type: "number",
            description: "Timeout in milliseconds (default 120000)",
          },
        },
        required: ["command"],
      },
      policy: (input) => validateToolRelativePath(input.cwd || "."),
      handler: async (ctx, input) => {
        const result = await ctx.sandbox.runCommand(input.command, {
          cwd: input.cwd,
          timeoutMs: input.timeout_ms,
        });
        await ctx.events.emit("command_output", {
          command: input.command,
          cwd: input.cwd || ".",
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          timedOut: Boolean(result.timedOut),
        });
        const combined = [
          `exit_code: ${result.exitCode}${result.timedOut ? " (TIMED OUT)" : ""}`,
          result.stdout ? `stdout:\n${result.stdout}` : "",
          result.stderr ? `stderr:\n${result.stderr}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        return capForModel(combined, MAX_MODEL_COMMAND_OUTPUT_CHARS);
      },
    };

  const startProcessTool: ToolDefinition<
    z.infer<typeof StartProcessInputSchema>
  > = {
    name: "start_process",
    description:
      "Start or restart a long-running background process inside the sandbox (such as a web or API server).",
    inputSchema: StartProcessInputSchema,
    jsonSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Unique alphanumeric process identifier, e.g. 'web' or 'api'",
        },
        command: {
          type: "string",
          description: "Command to run (bind servers to 0.0.0.0)",
        },
        cwd: {
          type: "string",
          description: "Relative working directory",
        },
        port: {
          type: "number",
          description: "Optional port number the process listens on",
        },
      },
      required: ["name", "command"],
    },
    policy: (input) => validateToolRelativePath(input.cwd || "."),
    handler: async (ctx, input) => {
      const proc = await ctx.sandbox.startProcess({
        name: input.name,
        command: input.command,
        cwd: input.cwd,
        port: input.port,
      });
      await ctx.events.emit("command_output", {
        command: `[start_process:${input.name}] ${input.command}`,
        cwd: input.cwd || ".",
        exitCode: 0,
        stdout: `Started process '${proc.name}'${proc.pid ? ` (pid ${proc.pid})` : ""}`,
        stderr: "",
      });
      return `Started background process '${proc.name}'${proc.pid ? ` (pid ${proc.pid})` : ""}`;
    },
  };

  const stopProcessTool: ToolDefinition<
    z.infer<typeof StopProcessInputSchema>
  > = {
    name: "stop_process",
    description: "Stop a background process started with start_process.",
    inputSchema: StopProcessInputSchema,
    jsonSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Process identifier to stop" },
      },
      required: ["name"],
    },
    handler: async (ctx, input) => {
      await ctx.sandbox.stopProcess(input.name);
      return `Stopped background process '${input.name}'`;
    },
  };

  const setPreviewTool: ToolDefinition<z.infer<typeof SetPreviewInputSchema>> =
    {
      name: "set_preview",
      description:
        "Register the active HTTP port and path in the sandbox so the user's live preview panel connects to your running application.",
      inputSchema: SetPreviewInputSchema,
      jsonSchema: {
        type: "object",
        properties: {
          port: {
            type: "number",
            description: "Port number the application is listening on (1024-65535)",
          },
          path: {
            type: "string",
            description: "URL path to open in preview (default '/')",
          },
        },
        required: ["port"],
      },
      handler: async (ctx, input) => {
        const normalizedPath = input.path.startsWith("/")
          ? input.path
          : `/${input.path}`;
        const res = await ctx.sandbox.setPreview({
          port: input.port,
          path: normalizedPath,
        });
        await ctx.events.emit("preview", {
          port: res.port,
          path: res.path,
          previewUrl: res.previewUrl,
        });
        return `Preview configured on port ${res.port} (${res.path})`;
      },
    };

  const readGuideTool: ToolDefinition<z.infer<typeof ReadGuideInputSchema>> = {
    name: "read_guide",
    description: `Read an optional advisory guide (${listGuideNames().join(", ")}).`,
    inputSchema: ReadGuideInputSchema,
    jsonSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: `Guide identifier (${listGuideNames().join(", ")})`,
        },
      },
      required: ["name"],
    },
    handler: async (_ctx, input) => {
      const content = getGuideContent(input.name);
      if (!content) {
        return `Unknown guide '${input.name}'. Available guides: ${listGuideNames().join(", ")}`;
      }
      return content;
    },
  };

  return [
    listFilesTool,
    readFileTool,
    searchFilesTool,
    writeFileTool,
    editFileTool,
    deleteFileTool,
    runCommandTool,
    startProcessTool,
    stopProcessTool,
    setPreviewTool,
    readGuideTool,
  ];
}
