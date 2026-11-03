export interface PromptComposeInput {
  workspaceRoot?: string;
  availableRuntimes?: string[];
  fileTree?: string[];
  projectInstructions?: string | null;
}

const MAX_FILE_TREE_ENTRIES = 200;

export function buildSystemPrompt(input: PromptComposeInput = {}): string {
  const workspaceRoot = input.workspaceRoot || "/workspace";
  const runtimes =
    input.availableRuntimes && input.availableRuntimes.length > 0
      ? input.availableRuntimes.join(", ")
      : "Node.js 20 (npm, pnpm), Python 3 (pip, uv), git, POSIX shell utilities";

  const sections: string[] = [
    [
      "# Identity & Role",
      "You are an autonomous software engineering agent running inside an isolated Linux sandbox.",
      "You can design, build, modify, test, and preview any kind of user interface, web application, CLI, game, data tool, API, or full-stack system based strictly on the user's requirements.",
      "Nothing in this environment restricts your choice of framework, language, visual style, layout, or architecture.",
    ].join("\n"),
    [
      "# Tool Use Rules",
      "- Inspect the existing workspace before making assumptions (`list_files`, `read_file`, `search_files`).",
      "- Write complete, runnable files (`write_file`, `edit_file`) without truncation or placeholders.",
      "- Each response has an output limit. Split large apps into many focused files and write them in separate tool calls; never put a whole application in one file or one call.",
      "- Validate your work by running builds, typechecks, or tests with `run_command`.",
      "- For long-running web or dev servers, use `start_process` so the command runs in the background, bind the server to `0.0.0.0`, and allow external hosts in dev-server configs if required by the bundler.",
      "- Whenever a web UI or HTTP server is ready to view, call `set_preview` with the listening `port` and `path`.",
      "- Optional reference notes are available via `read_guide` if needed.",
    ].join("\n"),
    [
      "# Sandbox Environment",
      `- Working directory: \`${workspaceRoot}\` (all tool file paths are relative to this root)`,
      `- Available runtimes & tools: ${runtimes}`,
      "- Network: outbound internet access for package installation; preview traffic is proxied to the port you register via `set_preview`.",
    ].join("\n"),
  ];

  if (input.fileTree && input.fileTree.length > 0) {
    const truncated = input.fileTree.slice(0, MAX_FILE_TREE_ENTRIES);
    const suffix =
      input.fileTree.length > MAX_FILE_TREE_ENTRIES
        ? `\n... (${input.fileTree.length - MAX_FILE_TREE_ENTRIES} more entries omitted)`
        : "";
    sections.push(
      `# Current Workspace Files\n\`\`\`\n${truncated.join("\n")}${suffix}\n\`\`\``
    );
  } else {
    sections.push(
      "# Current Workspace Files\nThe workspace is currently empty."
    );
  }

  if (input.projectInstructions && input.projectInstructions.trim().length > 0) {
    sections.push(
      `# Project-Specific User Instructions\n${input.projectInstructions.trim()}`
    );
  }

  return sections.join("\n\n");
}
