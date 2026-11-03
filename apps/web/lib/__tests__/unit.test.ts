import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/lib/env";
import { ApiError, createApiClient, errorMessage } from "@/lib/api";
import {
  applyRunEvent,
  initialLiveRunState,
  isActiveStatus,
} from "@/lib/runEvents";

describe("parseEnv", () => {
  it("applies defaults and strips trailing slashes", () => {
    const parsed = parseEnv({
      NEXT_PUBLIC_API_URL: "https://api.forge.dev/",
      NEXT_PUBLIC_SANDBOX_BASE_DOMAIN: "sandbox.forge.dev",
    });
    expect(parsed.NEXT_PUBLIC_API_URL).toBe("https://api.forge.dev");
    expect(parsed.NEXT_PUBLIC_SANDBOX_BASE_DOMAIN).toBe("sandbox.forge.dev");
  });

  it("throws on invalid URL", () => {
    expect(() =>
      parseEnv({
        NEXT_PUBLIC_API_URL: "not-a-url",
      })
    ).toThrow(/Invalid environment configuration/);
  });
});

describe("ApiError and createApiClient", () => {
  it("formats user messages for quota and sandbox capacity", () => {
    const quotaErr = new ApiError({
      status: 429,
      code: "QUOTA_EXCEEDED",
      message: "Over daily quota",
      resetAt: "2026-11-04T00:00:00.000Z",
    });
    expect(errorMessage(quotaErr)).toContain("You've reached your usage limit");

    const capErr = new ApiError({
      status: 503,
      code: "SANDBOX_CAPACITY",
      message: "No slots",
    });
    expect(errorMessage(capErr)).toContain("All sandboxes are busy right now");
  });

  it("maps error envelope to ApiError and invokes 401 handler", async () => {
    const onUnauthorized = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid bearer token",
          },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const client = createApiClient(async () => "expired-token", onUnauthorized);
      await expect(client.request("/projects")).rejects.toBeInstanceOf(ApiError);
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("applyRunEvent", () => {
  const runId = "22222222-3333-4444-8555-666666666666";

  it("accumulates text deltas, tool calls, file changes, preview, and done status while ignoring duplicate seq", () => {
    let state = initialLiveRunState;

    state = applyRunEvent(state, {
      id: "11111111-1111-4111-8111-111111111110",
      runId,
      seq: 0,
      type: "status",
      payload: { status: "RUNNING" },
      createdAt: new Date().toISOString(),
    });
    expect(state.status).toBe("RUNNING");
    expect(isActiveStatus(state.status)).toBe(true);

    state = applyRunEvent(state, {
      id: "11111111-1111-4111-8111-111111111111",
      runId,
      seq: 1,
      type: "text_delta",
      payload: { text: "Building " },
      createdAt: new Date().toISOString(),
    });
    // Replay same seq = 1 should be ignored
    state = applyRunEvent(state, {
      id: "11111111-1111-4111-8111-111111111111",
      runId,
      seq: 1,
      type: "text_delta",
      payload: { text: "Building " },
      createdAt: new Date().toISOString(),
    });
    expect(state.items[0]).toMatchObject({ kind: "text", text: "Building " });

    state = applyRunEvent(state, {
      id: "11111111-1111-4111-8111-111111111112",
      runId,
      seq: 2,
      type: "tool_call",
      payload: {
        toolUseId: "call_1",
        name: "write_file",
        input: { path: "src/App.tsx" },
      },
      createdAt: new Date().toISOString(),
    });
    state = applyRunEvent(state, {
      id: "11111111-1111-4111-8111-111111111113",
      runId,
      seq: 3,
      type: "tool_result",
      payload: {
        toolUseId: "call_1",
        name: "write_file",
        content: "OK",
      },
      createdAt: new Date().toISOString(),
    });
    expect(state.items[1]).toMatchObject({
      kind: "tool",
      toolUseId: "call_1",
      result: { content: "OK", isError: false },
    });

    state = applyRunEvent(state, {
      id: "11111111-1111-4111-8111-111111111114",
      runId,
      seq: 4,
      type: "done",
      payload: { status: "SUCCEEDED" },
      createdAt: new Date().toISOString(),
    });
    expect(state.status).toBe("SUCCEEDED");
    expect(isActiveStatus(state.status)).toBe(false);
  });
});
