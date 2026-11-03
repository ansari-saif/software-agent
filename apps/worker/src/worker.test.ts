import { describe, expect, it } from "vitest";
import { BufferedRunEventSink, type PersistedEvent } from "./eventSink";
import { utcDay } from "./runProcessor";

describe("BufferedRunEventSink", () => {
  it("coalesces text deltas and keeps seq strictly increasing", async () => {
    const batches: PersistedEvent[][] = [];
    const sink = new BufferedRunEventSink(async (events) => {
      batches.push(events);
    }, 5);

    await sink.emit("text_delta", { text: "Hel" });
    await sink.emit("text_delta", { text: "lo" });
    await sink.emit("tool_call", { name: "write_file" });
    await sink.emit("text_delta", { text: "!" });
    await sink.emit("done", { status: "SUCCEEDED" });
    await sink.flush();

    const all = batches.flat();
    expect(all.map((e) => e.type)).toEqual(["text_delta", "tool_call", "text_delta", "done"]);
    expect(all[0]?.payload).toEqual({ text: "Hello" });
    expect(all.map((e) => e.seq)).toEqual([5, 6, 7, 8]);
  });

  it("flushes pending text after the timer", async () => {
    const batches: PersistedEvent[][] = [];
    const sink = new BufferedRunEventSink(async (events) => {
      batches.push(events);
    }, 0, 10);
    await sink.emit("text_delta", { text: "streaming" });
    await new Promise((r) => setTimeout(r, 30));
    await sink.flush();
    expect(batches.flat()).toEqual([{ seq: 0, type: "text_delta", payload: { text: "streaming" } }]);
  });
});

describe("utcDay", () => {
  it("formats as YYYY-MM-DD in UTC", () => {
    expect(utcDay(new Date("2026-11-03T23:59:59Z"))).toBe("2026-11-03");
  });
});
