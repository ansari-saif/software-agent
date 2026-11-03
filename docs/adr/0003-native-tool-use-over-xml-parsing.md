# ADR 0003: Native model tool use instead of parsing XML/JSON from model text

- Status: Accepted
- Date: 2026-11-03

## Context

The old agents asked the model to emit custom XML (`<boltArtifact>`, `<boltAction>` and similar) or JSON inside free text. Regex/AST parsers then turned that into file writes and shell commands. This approach had several problems:

- Path traversal: model-supplied paths went straight into `path.join` (SEC-02).
- Model-written code was injected into generated source files (SEC-09).
- Malformed output silently produced partial or broken projects. The parser was the most bug-prone part of the system.
- There was no turn-taking. The model could not see command output or fix its own errors.

## Decision

Use the provider's **native tool-use API** (Anthropic `tools` / `tool_use` / `tool_result`) through `packages/agent-core`:

- Each tool (list, read, search, write, edit and delete files, exec, start/stop process, and so on) has a **zod schema**. That schema generates the JSON Schema sent to the model and also validates the arguments before execution. Invalid arguments come back to the model as a `tool_result` error. They are never executed.
- Tool implementations do nothing locally. They call the sandbox-controller, which applies path-safety checks and runs inside the project's sandbox.
- The loop is bounded by `AGENT_MAX_STEPS`, `AGENT_MAX_STEP_TOKENS`, `AGENT_MAX_RUN_OUTPUT_TOKENS` and `DAILY_TOKEN_QUOTA`. Runs can be cancelled.
- Providers sit behind an interface. A fake provider drives deterministic tests.

## Consequences

- There is no parser to maintain, and "the model emitted something weird" becomes a validation error the model can recover from.
- The trust boundary is explicit: tool arguments are the only channel from the model to side effects.
- Prompts stay generic. Stack-specific templates are unnecessary because the model can inspect and iterate.
- The design is coupled to providers that support tool use, which all current frontier providers do.
