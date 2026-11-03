import type {
  ModelProvider,
  ModelTurnInput,
  ModelTurnOutput,
} from "../types";

export type FakeTurnHandler = (
  input: ModelTurnInput,
  turnIndex: number
) => Promise<ModelTurnOutput> | ModelTurnOutput;

export class FakeModelProvider implements ModelProvider {
  public readonly modelId = "fake-model";
  private turnIndex = 0;
  private readonly handler: FakeTurnHandler;

  constructor(scriptOrHandler: ModelTurnOutput[] | FakeTurnHandler) {
    if (Array.isArray(scriptOrHandler)) {
      this.handler = (_input, idx) => {
        const turn = scriptOrHandler[idx];
        if (!turn) {
          return {
            blocks: [{ type: "text", text: "Done." }],
            stopReason: "end_turn",
            inputTokens: 10,
            outputTokens: 5,
            costMicros: 105,
          };
        }
        return turn;
      };
    } else {
      this.handler = scriptOrHandler;
    }
  }

  async streamTurn(input: ModelTurnInput): Promise<ModelTurnOutput> {
    if (input.signal?.aborted) {
      throw new Error("Run cancelled via AbortSignal");
    }
    const idx = this.turnIndex++;
    const result = await this.handler(input, idx);
    for (const block of result.blocks) {
      if (block.type === "text" && input.onTextDelta) {
        await input.onTextDelta(block.text);
      }
    }
    return result;
  }
}
