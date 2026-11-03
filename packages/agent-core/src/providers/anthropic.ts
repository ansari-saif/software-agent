import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlock } from "@repo/contracts";
import type {
  ConversationMessage,
  ModelProvider,
  ModelTurnInput,
  ModelTurnOutput,
} from "../types";

export const DEFAULT_AGENT_MODEL = "claude-sonnet-4-5-20250929";

// Approximate Sonnet pricing: $3 / 1M input tokens (3 micros/token), $15 / 1M output tokens (15 micros/token)
const INPUT_TOKEN_COST_MICROS = 3;
const OUTPUT_TOKEN_COST_MICROS = 15;

export function estimateCostMicros(
  inputTokens: number,
  outputTokens: number
): number {
  return (
    Math.max(0, inputTokens) * INPUT_TOKEN_COST_MICROS +
    Math.max(0, outputTokens) * OUTPUT_TOKEN_COST_MICROS
  );
}

function toAnthropicMessages(
  messages: ConversationMessage[]
): Anthropic.MessageParam[] {
  return messages.map((msg) => {
    const blocks: Anthropic.ContentBlockParam[] = msg.content.map((b) => {
      switch (b.type) {
        case "text":
          return { type: "text", text: b.text };
        case "image":
          return {
            type: "image",
            source: {
              type: "base64",
              media_type: b.mediaType,
              data: b.base64,
            },
          };
        case "tool_use":
          return {
            type: "tool_use",
            id: b.id,
            name: b.name,
            input: b.input,
          };
        case "tool_result":
          return {
            type: "tool_result",
            tool_use_id: b.toolUseId,
            content: b.content,
            is_error: b.isError,
          };
      }
    });
    return {
      role: msg.role === "USER" ? "user" : "assistant",
      content: blocks,
    };
  });
}

export class AnthropicProvider implements ModelProvider {
  public readonly modelId: string;
  private readonly client: Anthropic;

  constructor(options?: { apiKey?: string; modelId?: string }) {
    this.modelId =
      options?.modelId || process.env.AGENT_MODEL || DEFAULT_AGENT_MODEL;
    this.client = new Anthropic({
      apiKey: options?.apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  async streamTurn(input: ModelTurnInput): Promise<ModelTurnOutput> {
    const tools: Anthropic.Tool[] = input.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));

    const stream = this.client.messages.stream(
      {
        model: this.modelId,
        max_tokens: input.maxTokens,
        temperature: 0,
        system: [
          {
            type: "text",
            text: input.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: toAnthropicMessages(input.messages),
        tools,
      },
      { signal: input.signal }
    );

    if (input.onTextDelta) {
      stream.on("text", (textDelta: string) => {
        void input.onTextDelta?.(textDelta);
      });
    }

    const finalMessage = await stream.finalMessage();

    const blocks: ContentBlock[] = [];
    for (const block of finalMessage.content) {
      if (block.type === "text") {
        if (block.text.length > 0) {
          blocks.push({ type: "text", text: block.text });
        }
      } else if (block.type === "tool_use") {
        blocks.push({
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }

    const inputTokens = finalMessage.usage?.input_tokens ?? 0;
    const outputTokens = finalMessage.usage?.output_tokens ?? 0;
    const stopReason =
      finalMessage.stop_reason === "tool_use"
        ? "tool_use"
        : finalMessage.stop_reason === "max_tokens"
          ? "max_tokens"
          : finalMessage.stop_reason === "stop_sequence"
            ? "stop_sequence"
            : "end_turn";

    return {
      blocks,
      stopReason,
      inputTokens,
      outputTokens,
      costMicros: estimateCostMicros(inputTokens, outputTokens),
    };
  }
}
