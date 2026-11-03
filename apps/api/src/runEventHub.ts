import { Client } from "pg";
import type { Logger } from "pino";

export const RUN_EVENTS_CHANNEL = "run_events";

export interface RunEventHub {
  subscribe(runId: string, onNotify: () => void): () => void;
}

/** In-memory fan-out used by tests and as the base for the Postgres hub. */
export class LocalRunEventHub implements RunEventHub {
  private listeners = new Map<string, Set<() => void>>();

  subscribe(runId: string, onNotify: () => void): () => void {
    let set = this.listeners.get(runId);
    if (!set) {
      set = new Set();
      this.listeners.set(runId, set);
    }
    set.add(onNotify);
    return () => {
      set.delete(onNotify);
      if (set.size === 0) this.listeners.delete(runId);
    };
  }

  notify(runId: string): void {
    for (const listener of this.listeners.get(runId) ?? []) listener();
  }

  notifyAll(): void {
    for (const set of this.listeners.values()) for (const listener of set) listener();
  }
}

/** One dedicated LISTEN connection per API process; reconnects with backoff. */
export class PostgresRunEventHub extends LocalRunEventHub {
  private client: Client | null = null;
  private stopped = false;

  constructor(
    private readonly connectionString: string,
    private readonly logger: Logger
  ) {
    super();
  }

  async start(): Promise<void> {
    const client = new Client({ connectionString: this.connectionString });
    client.on("notification", (msg) => {
      if (msg.channel !== RUN_EVENTS_CHANNEL || !msg.payload) return;
      try {
        const { runId } = JSON.parse(msg.payload) as { runId?: string };
        if (runId) this.notify(runId);
      } catch {
        this.logger.warn("ignoring malformed run_events notification");
      }
    });
    client.on("error", (err) => {
      this.logger.error({ err }, "run event LISTEN connection failed");
      void this.reconnect();
    });
    await client.connect();
    await client.query(`LISTEN ${RUN_EVENTS_CHANNEL}`);
    this.client = client;
    // Events may have been written while disconnected; let subscribers re-read.
    this.notifyAll();
  }

  private async reconnect(): Promise<void> {
    const old = this.client;
    this.client = null;
    await old?.end().catch(() => undefined);
    for (let attempt = 1; !this.stopped; attempt++) {
      await new Promise((r) => setTimeout(r, Math.min(30_000, 500 * 2 ** attempt)));
      try {
        await this.start();
        return;
      } catch (err) {
        this.logger.warn({ err, attempt }, "retrying run event LISTEN connection");
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.client?.end().catch(() => undefined);
  }
}
