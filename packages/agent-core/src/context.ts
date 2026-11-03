import type { ContentBlock, ToolUseBlock } from "@repo/contracts";
import type { ConversationMessage } from "./types";

export interface ContextBudgetOptions {
  maxApproxTokens?: number;
  keepRecentTurnsWithFullTools?: number;
  maxToolResultCharsInRecentTurns?: number;
}

const CHARS_PER_TOKEN = 4;

export function estimateBlockChars(block: ContentBlock): number {
  switch (block.type) {
    case "text":
      return block.text.length;
    case "image":
      return 4000; // fixed approximate token weight for images
    case "tool_use":
      return block.name.length + JSON.stringify(block.input).length;
    case "tool_result":
      return block.content.length;
  }
}

export function estimateMessagesTokens(messages: ConversationMessage[]): number {
  let chars = 0;
  for (const msg of messages) {
    for (const block of msg.content) {
      chars += estimateBlockChars(block);
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Keeps conversation history within a token budget (DB-04):
 * 1. Replaces bulky tool_result payloads in older turns with concise stubs.
 * 2. Caps oversized tool_result blocks in recent turns.
 * 3. If total estimated tokens still exceed maxApproxTokens, summarizes/drops the oldest middle turns while preserving the initial user goal and most recent turns.
 */
/**
 * The model API rejects a tool_use that is not answered by a tool_result in the next
 * message. Runs that were cut off (output limit, crash, cancel) can leave such turns in
 * stored history, so answer every unanswered tool_use with an error result.
 */
export function repairToolPairs(messages: ConversationMessage[]): ConversationMessage[] {
  const out: ConversationMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    out.push(msg);
    if (msg.role !== "ASSISTANT") continue;
    const toolUses = msg.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) continue;

    const next = messages[i + 1];
    const answered = new Set(
      next?.role === "USER"
        ? next.content.flatMap((b) => (b.type === "tool_result" ? [b.toolUseId] : []))
        : []
    );
    const missing: ContentBlock[] = toolUses
      .filter((t) => !answered.has(t.id))
      .map((t) => ({
        type: "tool_result",
        toolUseId: t.id,
        name: t.name,
        content: "Not executed: the previous turn was interrupted before this tool call completed.",
        isError: true,
      }));
    if (missing.length === 0) continue;

    if (next?.role === "USER") {
      out.push({ role: "USER", content: [...missing, ...next.content] });
      i += 1;
    } else {
      out.push({ role: "USER", content: missing });
    }
  }
  return out;
}

export function trimConversationContext(
  messages: ConversationMessage[],
  options: ContextBudgetOptions = {}
): ConversationMessage[] {
  const maxApproxTokens = options.maxApproxTokens ?? 60_000;
  const keepRecent = options.keepRecentTurnsWithFullTools ?? 6;
  const maxRecentToolChars = options.maxToolResultCharsInRecentTurns ?? 12_000;

  const cutoffIndex = Math.max(0, messages.length - keepRecent);

  const compacted: ConversationMessage[] = messages.map((msg, idx) => {
    const isOldTurn = idx < cutoffIndex;
    const newBlocks: ContentBlock[] = msg.content.map((block) => {
      if (block.type !== "tool_result") {
        return block;
      }
      if (isOldTurn && block.content.length > 300) {
        return {
          ...block,
          content: `[tool_result from ${block.name} (${block.content.length} chars) omitted from older turn; re-read file if needed]`,
        };
      }
      if (!isOldTurn && block.content.length > maxRecentToolChars) {
        const half = Math.floor(maxRecentToolChars / 2);
        return {
          ...block,
          content:
            block.content.slice(0, half) +
            `\n...[truncated ${block.content.length - maxRecentToolChars} chars]...\n` +
            block.content.slice(-half),
        };
      }
      return block;
    });
    return { role: msg.role, content: newBlocks };
  });

  if (estimateMessagesTokens(compacted) <= maxApproxTokens || compacted.length <= 4) {
    return compacted;
  }

  // Keep the first user message, a summary marker, and the latest turns that fit within budget
  const first = compacted[0]!;
  const tail: ConversationMessage[] = [];
  let runningTokens = estimateMessagesTokens([first]) + 250;

  for (let i = compacted.length - 1; i >= 1; i--) {
    const candidate = compacted[i]!;
    const candidateTokens = estimateMessagesTokens([candidate]);
    if (runningTokens + candidateTokens > maxApproxTokens && tail.length >= 2) {
      break;
    }
    tail.unshift(candidate);
    runningTokens += candidateTokens;
  }

  // Ensure valid alternating/assistant-tool structure at the boundary:
  // Do not start tail with a USER message that contains tool_result without its preceding ASSISTANT tool_use
  while (
    tail.length > 0 &&
    tail[0]?.role === "USER" &&
    tail[0].content.some((b) => b.type === "tool_result")
  ) {
    tail.shift();
  }

  const droppedCount = compacted.length - 1 - tail.length;
  if (droppedCount <= 0) {
    return compacted;
  }

  const summaryTurn: ConversationMessage = {
    role: "ASSISTANT",
    content: [
      {
        type: "text",
        text: `[Context summary: ${droppedCount} earlier turns were compacted to stay within context budget. Inspect current workspace files with list_files/read_file as needed.]`,
      },
    ],
  };

  if (tail[0]?.role === "ASSISTANT") {
    return [first, ...tail];
  }
  return [first, summaryTurn, ...tail];
}
