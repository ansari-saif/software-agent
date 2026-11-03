import type { ContentBlock, ToolResultBlock, ToolUseBlock } from "@repo/contracts";
import { repairToolPairs, trimConversationContext } from "./context";
import { buildSystemPrompt, type PromptComposeInput } from "./prompt";
import { createDefaultTools } from "./tools";
import type {
  ConversationMessage,
  EventSink,
  ModelProvider,
  SandboxClient,
  ToolDefinition,
} from "./types";

const MAX_CONSECUTIVE_TRUNCATIONS = 3;

export interface RunAgentLoopInput {
  projectId: string;
  userId: string;
  runId: string;
  provider: ModelProvider;
  sandbox: SandboxClient;
  events: EventSink;
  history: ConversationMessage[];
  promptInput?: PromptComposeInput;
  tools?: ToolDefinition<any>[];
  maxSteps?: number;
  maxTokensPerStep?: number;
  maxTotalOutputTokens?: number;
  signal?: AbortSignal;
  isCancelled?: () => Promise<boolean> | boolean;
  onMessageCommitted?: (msg: ConversationMessage) => Promise<void> | void;
}

export interface RunAgentLoopResult {
  status: "SUCCEEDED" | "FAILED" | "CANCELLED";
  stepsExecuted: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  newMessages: ConversationMessage[];
  error?: string;
}

export async function runAgentLoop(
  input: RunAgentLoopInput
): Promise<RunAgentLoopResult> {
  const maxSteps =
    input.maxSteps ?? Number(process.env.AGENT_MAX_STEPS || 25);
  const maxTokensPerStep =
    input.maxTokensPerStep ?? Number(process.env.AGENT_MAX_STEP_TOKENS || 8192);
  const maxTotalOutputTokens =
    input.maxTotalOutputTokens ??
    Number(process.env.AGENT_MAX_RUN_OUTPUT_TOKENS || 64_000);

  const tools = input.tools ?? createDefaultTools();
  const toolMap = new Map<string, ToolDefinition<any>>(
    tools.map((t) => [t.name, t])
  );

  const systemPrompt = buildSystemPrompt(input.promptInput);
  const workingHistory: ConversationMessage[] = repairToolPairs(input.history);
  const newMessages: ConversationMessage[] = [];
  let consecutiveTruncations = 0;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostMicros = 0;
  let stepsExecuted = 0;

  const checkCancelled = async (): Promise<boolean> => {
    if (input.signal?.aborted) return true;
    if (input.isCancelled) {
      return await input.isCancelled();
    }
    return false;
  };

  try {
    await input.events.emit("status", {
      status: "RUNNING",
      model: input.provider.modelId,
    });

    while (stepsExecuted < maxSteps) {
      if (await checkCancelled()) {
        await input.events.emit("done", {
          status: "CANCELLED",
          stepsExecuted,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        });
        return {
          status: "CANCELLED",
          stepsExecuted,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costMicros: totalCostMicros,
          newMessages,
        };
      }

      stepsExecuted += 1;
      const trimmedMessages = trimConversationContext(workingHistory);

      const turn = await input.provider.streamTurn({
        systemPrompt,
        messages: trimmedMessages,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.jsonSchema,
        })),
        maxTokens: maxTokensPerStep,
        signal: input.signal,
        onTextDelta: async (delta) => {
          await input.events.emit("text_delta", { text: delta });
        },
      });

      totalInputTokens += turn.inputTokens;
      totalOutputTokens += turn.outputTokens;
      totalCostMicros += turn.costMicros;

      if (turn.blocks.length > 0) {
        const assistantMsg: ConversationMessage = {
          role: "ASSISTANT",
          content: turn.blocks,
        };
        workingHistory.push(assistantMsg);
        newMessages.push(assistantMsg);
        if (input.onMessageCommitted) {
          await input.onMessageCommitted(assistantMsg);
        }
      }

      const toolUses = turn.blocks.filter(
        (b): b is ToolUseBlock => b.type === "tool_use"
      );

      if (turn.stopReason === "max_tokens") {
        consecutiveTruncations += 1;
        if (consecutiveTruncations >= MAX_CONSECUTIVE_TRUNCATIONS) {
          const truncError = `Model output hit the per-step limit (${maxTokensPerStep} tokens) ${consecutiveTruncations} times in a row`;
          await input.events.emit("error", { message: truncError });
          await input.events.emit("done", {
            status: "FAILED",
            error: truncError,
            stepsExecuted,
          });
          return {
            status: "FAILED",
            stepsExecuted,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            costMicros: totalCostMicros,
            newMessages,
            error: truncError,
          };
        }

        // A truncated tool call has incomplete arguments, so it is answered, not executed.
        const notice = `Your previous response was cut off at the output limit (${maxTokensPerStep} tokens).`;
        const recovery: ContentBlock[] =
          toolUses.length > 0
            ? toolUses.map((t) => ({
                type: "tool_result",
                toolUseId: t.id,
                name: t.name,
                content: `Not executed: ${notice} Its arguments were incomplete. Split large content into several smaller files or calls (well under ${Math.floor(maxTokensPerStep / 2)} tokens each) and retry.`,
                isError: true,
              }))
            : [{ type: "text", text: `${notice} Continue from where you stopped, keeping each response and tool call smaller.` }];
        for (const block of recovery) {
          if (block.type !== "tool_result") continue;
          await input.events.emit("tool_result", {
            toolUseId: block.toolUseId,
            name: block.name,
            content: block.content,
            isError: true,
          });
        }
        const pending: ConversationMessage[] = [{ role: "USER", content: recovery }];
        if (turn.blocks.length === 0) {
          pending.unshift({ role: "ASSISTANT", content: [{ type: "text", text: "(no output)" }] });
        }
        for (const msg of pending) {
          workingHistory.push(msg);
          newMessages.push(msg);
          if (input.onMessageCommitted) {
            await input.onMessageCommitted(msg);
          }
        }
        continue;
      }
      consecutiveTruncations = 0;

      if (toolUses.length === 0 || turn.stopReason !== "tool_use") {
        await input.events.emit("done", {
          status: "SUCCEEDED",
          stepsExecuted,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        });
        return {
          status: "SUCCEEDED",
          stepsExecuted,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costMicros: totalCostMicros,
          newMessages,
        };
      }

      if (totalOutputTokens >= maxTotalOutputTokens) {
        const budgetError = `Run exceeded maximum output token budget (${maxTotalOutputTokens})`;
        await input.events.emit("error", { message: budgetError });
        await input.events.emit("done", {
          status: "FAILED",
          error: budgetError,
          stepsExecuted,
        });
        return {
          status: "FAILED",
          stepsExecuted,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costMicros: totalCostMicros,
          newMessages,
          error: budgetError,
        };
      }

      const toolResults: ContentBlock[] = [];

      for (const toolUse of toolUses) {
        if (await checkCancelled()) {
          await input.events.emit("done", {
            status: "CANCELLED",
            stepsExecuted,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
          });
          return {
            status: "CANCELLED",
            stepsExecuted,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            costMicros: totalCostMicros,
            newMessages,
          };
        }

        await input.events.emit("tool_call", {
          toolUseId: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
        });

        const toolDef = toolMap.get(toolUse.name);
        let resultBlock: ToolResultBlock;

        if (!toolDef) {
          resultBlock = {
            type: "tool_result",
            toolUseId: toolUse.id,
            name: toolUse.name,
            content: `Error: Unknown tool '${toolUse.name}'`,
            isError: true,
          };
        } else {
          const parsed = toolDef.inputSchema.safeParse(toolUse.input);
          if (!parsed.success) {
            resultBlock = {
              type: "tool_result",
              toolUseId: toolUse.id,
              name: toolUse.name,
              content: `Validation error for tool '${toolUse.name}': ${parsed.error.message}`,
              isError: true,
            };
          } else {
            const policyCheck = toolDef.policy
              ? toolDef.policy(parsed.data)
              : { allowed: true };
            if (!policyCheck.allowed) {
              resultBlock = {
                type: "tool_result",
                toolUseId: toolUse.id,
                name: toolUse.name,
                content: `Policy rejected tool call '${toolUse.name}': ${policyCheck.reason || "Not permitted"}`,
                isError: true,
              };
            } else {
              try {
                const output = await toolDef.handler(
                  {
                    projectId: input.projectId,
                    userId: input.userId,
                    runId: input.runId,
                    sandbox: input.sandbox,
                    events: input.events,
                    signal: input.signal,
                  },
                  parsed.data
                );
                resultBlock = {
                  type: "tool_result",
                  toolUseId: toolUse.id,
                  name: toolUse.name,
                  content: output,
                  isError: false,
                };
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                resultBlock = {
                  type: "tool_result",
                  toolUseId: toolUse.id,
                  name: toolUse.name,
                  content: `Tool execution failed: ${msg}`,
                  isError: true,
                };
              }
            }
          }
        }

        await input.events.emit("tool_result", {
          toolUseId: resultBlock.toolUseId,
          name: resultBlock.name,
          content: resultBlock.content,
          isError: Boolean(resultBlock.isError),
        });

        toolResults.push(resultBlock);
      }

      const toolResultMessage: ConversationMessage = {
        role: "USER",
        content: toolResults,
      };
      workingHistory.push(toolResultMessage);
      newMessages.push(toolResultMessage);
      if (input.onMessageCommitted) {
        await input.onMessageCommitted(toolResultMessage);
      }
    }

    const stepLimitMsg = `Reached maximum step limit (${maxSteps}) without completion`;
    await input.events.emit("error", { message: stepLimitMsg });
    await input.events.emit("done", {
      status: "FAILED",
      error: stepLimitMsg,
      stepsExecuted,
    });
    return {
      status: "FAILED",
      stepsExecuted,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costMicros: totalCostMicros,
      newMessages,
      error: stepLimitMsg,
    };
  } catch (err) {
    if (await checkCancelled()) {
      await input.events.emit("done", {
        status: "CANCELLED",
        stepsExecuted,
      });
      return {
        status: "CANCELLED",
        stepsExecuted,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costMicros: totalCostMicros,
        newMessages,
      };
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    await input.events.emit("error", { message: errMsg });
    await input.events.emit("done", {
      status: "FAILED",
      error: errMsg,
      stepsExecuted,
    });
    return {
      status: "FAILED",
      stepsExecuted,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costMicros: totalCostMicros,
      newMessages,
      error: errMsg,
    };
  }
}
