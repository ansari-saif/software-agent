import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import pino, { type Logger } from "pino";

export function createLogger(service: string): Logger {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL || "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "headers.authorization",
        "token",
        "sessionToken",
        "password",
      ],
      censor: "[REDACTED]",
    },
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      log?: Logger;
    }
  }
}

export function requestContextMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incomingId = req.header("x-request-id");
    const requestId =
      incomingId && /^[a-zA-Z0-9_-]{1,64}$/.test(incomingId)
        ? incomingId
        : crypto.randomUUID();
    req.requestId = requestId;
    req.log = logger.child({ requestId });
    res.setHeader("x-request-id", requestId);

    const startedAt = Date.now();
    res.on("finish", () => {
      metrics.recordHttpRequest(req.method, res.statusCode, Date.now() - startedAt);
      req.log?.info(
        {
          method: req.method,
          path: req.originalUrl.split("?")[0],
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        },
        "http_request"
      );
    });
    next();
  };
}

export interface MetricsSnapshot {
  runsStarted: number;
  runsSucceeded: number;
  runsFailed: number;
  runsCancelled: number;
  inputTokensTotal: number;
  outputTokensTotal: number;
  costMicrosTotal: number;
  httpRequestsTotal: number;
  httpErrorsTotal: number;
}

class MetricsCollector {
  private snapshot: MetricsSnapshot = {
    runsStarted: 0,
    runsSucceeded: 0,
    runsFailed: 0,
    runsCancelled: 0,
    inputTokensTotal: 0,
    outputTokensTotal: 0,
    costMicrosTotal: 0,
    httpRequestsTotal: 0,
    httpErrorsTotal: 0,
  };

  recordRunStarted(): void {
    this.snapshot.runsStarted += 1;
  }

  recordRunCompleted(
    status: "SUCCEEDED" | "FAILED" | "CANCELLED",
    inputTokens: number,
    outputTokens: number,
    costMicros: number
  ): void {
    if (status === "SUCCEEDED") this.snapshot.runsSucceeded += 1;
    else if (status === "FAILED") this.snapshot.runsFailed += 1;
    else if (status === "CANCELLED") this.snapshot.runsCancelled += 1;

    this.snapshot.inputTokensTotal += Math.max(0, inputTokens);
    this.snapshot.outputTokensTotal += Math.max(0, outputTokens);
    this.snapshot.costMicrosTotal += Math.max(0, costMicros);
  }

  recordHttpRequest(_method: string, statusCode: number, _durationMs: number): void {
    this.snapshot.httpRequestsTotal += 1;
    if (statusCode >= 500) {
      this.snapshot.httpErrorsTotal += 1;
    }
  }

  getSnapshot(): MetricsSnapshot {
    return { ...this.snapshot };
  }
}

export const metrics = new MetricsCollector();

export function captureException(
  logger: Logger,
  err: unknown,
  context?: Record<string, unknown>
): void {
  logger.error(
    {
      err:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : String(err),
      ...context,
    },
    "captured_exception"
  );
}
