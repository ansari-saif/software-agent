import { prismaClient } from "db";
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./errors";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export type RateLimitConsumer = (key: string, limit: number, windowMs: number) => Promise<RateLimitResult>;

/** Fixed-window counter stored in Postgres so limits hold across API replicas. */
export const consumePostgres: RateLimitConsumer = async (key, limit, windowMs) => {
  const now = Date.now();
  const newExpire = BigInt(now + windowMs);
  const rows = await prismaClient.$queryRaw<Array<{ points: number; expire: bigint }>>`
    INSERT INTO "RateLimit" ("key", "points", "expire")
    VALUES (${key}, 1, ${newExpire})
    ON CONFLICT ("key") DO UPDATE SET
      "points" = CASE WHEN "RateLimit"."expire" IS NULL OR "RateLimit"."expire" < ${BigInt(now)} THEN 1 ELSE "RateLimit"."points" + 1 END,
      "expire" = CASE WHEN "RateLimit"."expire" IS NULL OR "RateLimit"."expire" < ${BigInt(now)} THEN ${newExpire} ELSE "RateLimit"."expire" END
    RETURNING "points", "expire"`;
  const row = rows[0];
  const points = row?.points ?? 1;
  const expire = Number(row?.expire ?? newExpire);
  return { allowed: points <= limit, remaining: Math.max(0, limit - points), resetAt: new Date(expire) };
};

export async function purgeExpiredRateLimits(): Promise<void> {
  await prismaClient.$executeRaw`DELETE FROM "RateLimit" WHERE "expire" < ${BigInt(Date.now())}`;
}

export function rateLimitMiddleware(
  consume: RateLimitConsumer,
  options: { prefix: string; limit: number; windowMs: number; keyOf: (req: Request) => string | undefined }
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = options.keyOf(req);
    if (!id) return next();
    const result = await consume(`${options.prefix}:${id}`, options.limit, options.windowMs);
    res.setHeader("RateLimit-Limit", String(options.limit));
    res.setHeader("RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000))));
      throw new ApiError("RATE_LIMITED", "Too many requests, slow down", {
        resetAt: result.resetAt.toISOString(),
      });
    }
    next();
  };
}
