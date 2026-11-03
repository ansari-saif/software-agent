import type { EventSink } from "@repo/agent-core";
import type { RunEventType } from "@repo/contracts";

export interface PersistedEvent {
  seq: number;
  type: RunEventType;
  payload: Record<string, unknown>;
}

export type PersistFn = (events: PersistedEvent[]) => Promise<void>;

/**
 * Persists run events with monotonically increasing `seq`.
 * Consecutive text deltas are coalesced and flushed on a short timer so a
 * streaming response does not become one database row per token.
 */
export class BufferedRunEventSink implements EventSink {
  private seq: number;
  private pendingText = "";
  private timer: NodeJS.Timeout | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly persist: PersistFn,
    startSeq = 0,
    private readonly flushMs = 250
  ) {
    this.seq = startSeq;
  }

  emit(type: RunEventType, payload: Record<string, unknown>): Promise<void> {
    if (type === "text_delta") {
      this.pendingText += typeof payload.text === "string" ? payload.text : "";
      if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.enqueue([]);
        }, this.flushMs);
      }
      return Promise.resolve();
    }
    return this.enqueue([{ type, payload }]);
  }

  flush(): Promise<void> {
    return this.enqueue([]);
  }

  private enqueue(events: Array<{ type: RunEventType; payload: Record<string, unknown> }>): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batch: PersistedEvent[] = [];
    if (this.pendingText) {
      batch.push({ seq: this.seq++, type: "text_delta", payload: { text: this.pendingText } });
      this.pendingText = "";
    }
    for (const e of events) {
      batch.push({ seq: this.seq++, ...e });
    }
    if (batch.length === 0) return this.chain;
    this.chain = this.chain.then(() => this.persist(batch));
    return this.chain;
  }
}
