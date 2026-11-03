import type { ApiErrorCode } from "@repo/contracts";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  SANDBOX_CAPACITY: 503,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly extra: { details?: unknown; resetAt?: string; status?: number } = {}
  ) {
    super(message);
    this.status = extra.status ?? STATUS_BY_CODE[code];
  }
}

export const notFound = (what = "Resource"): ApiError => new ApiError("NOT_FOUND", `${what} not found`);

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid request", details: err.flatten() },
    });
    return;
  }
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.extra.details !== undefined ? { details: err.extra.details } : {}),
        ...(err.extra.resetAt ? { resetAt: err.extra.resetAt } : {}),
      },
    });
    return;
  }
  const bodyError = err as { type?: string; status?: number };
  if (bodyError?.type === "entity.too.large") {
    res.status(413).json({ error: { code: "VALIDATION_ERROR", message: "Request body too large" } });
    return;
  }
  if (bodyError?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Malformed JSON body" } });
    return;
  }
  req.log?.error({ err }, "unhandled API error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}
