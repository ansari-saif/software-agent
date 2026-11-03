import { ApiErrorEnvelopeSchema, type ApiErrorCode } from "@repo/contracts";
import type { ZodType, ZodTypeDef } from "zod";
import { API_V1_URL } from "@/lib/env";

export type ClientErrorCode = ApiErrorCode | "NETWORK_ERROR" | "INVALID_RESPONSE";

const FRIENDLY_MESSAGES: Partial<Record<ClientErrorCode, string>> = {
  UNAUTHORIZED: "Your session has expired. Please sign in again.",
  FORBIDDEN: "You don't have access to this resource.",
  NOT_FOUND: "We couldn't find that.",
  CONFLICT: "The agent is still working. Wait for it to finish or stop it first.",
  SANDBOX_CAPACITY: "All sandboxes are busy right now. Try again in a minute.",
  INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
  NETWORK_ERROR: "Can't reach the server. Check your connection and try again.",
  INVALID_RESPONSE: "The server sent an unexpected response.",
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly details?: unknown;
  readonly resetAt?: string;

  constructor(opts: {
    status: number;
    code: ClientErrorCode;
    message: string;
    details?: unknown;
    resetAt?: string;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
    this.resetAt = opts.resetAt;
  }

  /** Message that is safe and useful to show to end users. */
  get userMessage(): string {
    if (this.code === "RATE_LIMITED" || this.code === "QUOTA_EXCEEDED") {
      const when = this.resetAt ? new Date(this.resetAt) : null;
      const suffix =
        when && !Number.isNaN(when.getTime())
          ? ` Try again after ${when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
          : " Try again later.";
      return (this.code === "RATE_LIMITED" ? "You're sending requests too quickly." : "You've reached your usage limit.") + suffix;
    }
    if (this.code === "VALIDATION_ERROR" && this.message) return this.message;
    return FRIENDLY_MESSAGES[this.code] ?? this.message;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.userMessage;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong.";
}

function codeForStatus(status: number): ClientErrorCode {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 422 || status === 400) return "VALIDATION_ERROR";
  if (status === 429) return "RATE_LIMITED";
  return "INTERNAL_ERROR";
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON error body; fall back to the status code.
  }
  const parsed = ApiErrorEnvelopeSchema.safeParse(body);
  if (parsed.success) {
    return new ApiError({ status: res.status, ...parsed.data.error });
  }
  return new ApiError({
    status: res.status,
    code: codeForStatus(res.status),
    message: res.statusText || `Request failed (${res.status})`,
  });
}

export type TokenGetter = () => Promise<string | null>;

export interface RequestOptions<T> {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  schema?: ZodType<T, ZodTypeDef, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T = void>(path: string, opts?: RequestOptions<T>): Promise<T>;
  download(path: string, filename: string): Promise<void>;
}

export function createApiClient(
  getToken: TokenGetter,
  onUnauthorized?: () => void
): ApiClient {
  async function send(path: string, init: RequestInit & { idempotencyKey?: string }) {
    const token = await getToken();
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey);

    let res: Response;
    try {
      res = await fetch(`${API_V1_URL}${path}`, { ...init, headers });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      throw new ApiError({ status: 0, code: "NETWORK_ERROR", message: "Network request failed" });
    }
    if (!res.ok) {
      const error = await toApiError(res);
      if (error.status === 401) onUnauthorized?.();
      throw error;
    }
    return res;
  }

  return {
    async request<T>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
      const res = await send(path, {
        method: opts.method ?? "GET",
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        headers: opts.body === undefined ? undefined : { "Content-Type": "application/json" },
        idempotencyKey: opts.idempotencyKey,
        signal: opts.signal,
      });
      if (res.status === 204 || res.headers.get("content-length") === "0") {
        return undefined as T;
      }
      const data: unknown = await res.json().catch(() => undefined);
      if (!opts.schema) return data as T;
      const parsed = opts.schema.safeParse(data);
      if (!parsed.success) {
        throw new ApiError({
          status: res.status,
          code: "INVALID_RESPONSE",
          message: parsed.error.message,
        });
      }
      return parsed.data;
    },

    async download(path: string, filename: string) {
      const res = await send(path, { method: "GET" });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
