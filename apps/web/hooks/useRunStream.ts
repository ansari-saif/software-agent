"use client";

import { useAuth } from "@clerk/nextjs";
import { RunEventSchema, RunEventTypeSchema, type RunEvent } from "@repo/contracts";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { API_V1_URL } from "@/lib/env";
import { applyRunEvent, initialLiveRunState, type LiveRunState } from "@/lib/runEvents";

export type StreamConnection = "idle" | "connecting" | "open" | "reconnecting" | "closed" | "failed";

interface StreamState {
  runId: string | null;
  connection: StreamConnection;
  live: LiveRunState;
}

type Action =
  | { type: "reset"; runId: string | null }
  | { type: "connection"; connection: StreamConnection }
  | { type: "event"; event: RunEvent };

function reducer(state: StreamState, action: Action): StreamState {
  switch (action.type) {
    case "reset":
      return { runId: action.runId, connection: action.runId ? "connecting" : "idle", live: initialLiveRunState };
    case "connection":
      return { ...state, connection: action.connection };
    case "event":
      return { ...state, live: applyRunEvent(state.live, action.event) };
  }
}

const MAX_RECONNECTS = 8;
const MAX_BACKOFF_MS = 15_000;

interface Handlers {
  onEvent?: (event: RunEvent) => void;
  onDone?: (event: RunEvent) => void;
}

/**
 * Subscribes to a run's SSE stream. Resumes from the last seen sequence on
 * reconnect (with exponential backoff) and stops after the `done` event.
 */
export function useRunStream(runId: string | null, handlers: Handlers = {}) {
  const { getToken } = useAuth();
  const [state, dispatch] = useReducer(reducer, {
    runId: null,
    connection: "idle",
    live: initialLiveRunState,
  });

  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const handlersRef = useRef(handlers);
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    handlersRef.current = handlers;
    getTokenRef.current = getToken;
  });

  useEffect(() => {
    dispatch({ type: "reset", runId });
    if (!runId) return;

    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let lastSeq = -1;
    let finished = false;

    const handle = (e: MessageEvent<string>) => {
      let json: unknown;
      try {
        json = JSON.parse(e.data);
      } catch {
        return;
      }
      const parsed = RunEventSchema.safeParse(json);
      if (!parsed.success || parsed.data.runId !== runId || parsed.data.seq <= lastSeq) return;
      const event = parsed.data;
      lastSeq = event.seq;
      dispatch({ type: "event", event });
      handlersRef.current.onEvent?.(event);
      if (event.type === "done") {
        finished = true;
        source?.close();
        dispatch({ type: "connection", connection: "closed" });
        handlersRef.current.onDone?.(event);
      }
    };

    const scheduleReconnect = () => {
      source?.close();
      if (finished) return;
      attempts += 1;
      if (attempts > MAX_RECONNECTS) {
        dispatch({ type: "connection", connection: "failed" });
        return;
      }
      dispatch({ type: "connection", connection: "reconnecting" });
      const backoff = Math.min(1000 * 2 ** (attempts - 1), MAX_BACKOFF_MS);
      timer = setTimeout(connect, backoff + Math.random() * 250);
    };

    async function connect() {
      if (finished) return;
      let token: string | null = null;
      try {
        token = await getTokenRef.current();
      } catch {
        // Fall through; the server will reject and we back off.
      }
      if (finished) return;

      const url = new URL(`${API_V1_URL}/runs/${runId}/events`);
      if (token) url.searchParams.set("token", token);
      if (lastSeq >= 0) url.searchParams.set("lastEventId", String(lastSeq));

      source = new EventSource(url);
      source.onopen = () => {
        attempts = 0;
        dispatch({ type: "connection", connection: "open" });
      };
      for (const type of RunEventTypeSchema.options) {
        if (type !== "error") source.addEventListener(type, handle);
      }
      source.addEventListener("message", handle);
      // `error` is both the server's run-error event and EventSource's connection failure.
      source.addEventListener("error", (e) => {
        if (e instanceof MessageEvent && typeof e.data === "string" && e.data) {
          handle(e as MessageEvent<string>);
        } else {
          scheduleReconnect();
        }
      });
    }

    void connect();

    return () => {
      finished = true;
      clearTimeout(timer);
      source?.close();
    };
  }, [runId, attempt]);

  const current =
    state.runId === runId ? state : { runId, connection: "idle" as const, live: initialLiveRunState };
  return { ...current, retry };
}
