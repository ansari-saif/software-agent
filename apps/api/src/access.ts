import type { PortalRole } from "@repo/contracts";
import { prismaClient, type PrismaClient } from "db";
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./errors";

/** Compared case-insensitively. Never written to PortalAccess. */
export const SUPERADMIN_EMAIL = "saifhussainansari6@gmail.com";

export const ACCESS_NOT_GRANTED = "Access has not been granted.";

const EMAIL_TTL_MS = 5 * 60 * 1000;

export type AccessRowStatus = "PENDING" | "ENABLED";

export interface AccessRecord {
  email: string;
  status: AccessRowStatus;
  createdAt: Date;
}

export interface AccessStore {
  getByEmail(email: string): Promise<AccessRecord | null>;
  list(): Promise<{ requests: AccessRecord[]; enabled: AccessRecord[] }>;
  /** Inserts PENDING. Existing rows, including ENABLED, are left unchanged. */
  request(email: string): Promise<void>;
  /** Inserts or updates the row to ENABLED. */
  enable(email: string): Promise<void>;
  /** Deletes an ENABLED row. Refuses the superadmin email. */
  removeEnabled(email: string): Promise<void>;
  /** Deletes a PENDING row. ENABLED rows stay enabled. */
  dismissPending(email: string): Promise<void>;
}

export interface PortalIdentity {
  userId: string;
  email: string;
  role: PortalRole;
}

export class AccessStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessStoreError";
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isSuperadminEmail(email: string): boolean {
  return normalizeEmail(email) === SUPERADMIN_EMAIL;
}

export function validEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > 254 || /\s/.test(normalized)) return false;
  const at = normalized.indexOf("@");
  if (at <= 0 || at !== normalized.lastIndexOf("@") || at === normalized.length - 1) return false;
  const domain = normalized.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

/** Superadmin writes are refused here so a handler cannot persist that email. */
function writableEmail(email: string, onSuperadmin: "skip" | "reject"): string | null {
  const normalized = normalizeEmail(email);
  if (isSuperadminEmail(normalized)) {
    if (onSuperadmin === "reject") throw new AccessStoreError("cannot remove superadmin");
    return null;
  }
  if (!validEmail(normalized)) throw new AccessStoreError("invalid email");
  return normalized;
}

export function sortAccessRecords(rows: AccessRecord[]): AccessRecord[] {
  return [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.email.localeCompare(b.email)
  );
}

function splitList(rows: AccessRecord[]): { requests: AccessRecord[]; enabled: AccessRecord[] } {
  const sorted = sortAccessRecords(rows);
  return {
    requests: sorted.filter((row) => row.status === "PENDING"),
    enabled: sorted.filter((row) => row.status === "ENABLED"),
  };
}

export function createMemoryAccessStore(): AccessStore {
  const rows = new Map<string, AccessRecord>();
  return {
    async getByEmail(email) {
      return rows.get(normalizeEmail(email)) ?? null;
    },
    async list() {
      return splitList([...rows.values()]);
    },
    async request(email) {
      const key = writableEmail(email, "skip");
      if (!key || rows.has(key)) return;
      rows.set(key, { email: key, status: "PENDING", createdAt: new Date() });
    },
    async enable(email) {
      const key = writableEmail(email, "skip");
      if (!key) return;
      const existing = rows.get(key);
      rows.set(key, { email: key, status: "ENABLED", createdAt: existing?.createdAt ?? new Date() });
    },
    async removeEnabled(email) {
      const key = writableEmail(email, "reject");
      if (!key) return;
      const row = rows.get(key);
      if (row?.status === "ENABLED") rows.delete(key);
    },
    async dismissPending(email) {
      const key = writableEmail(email, "skip");
      if (!key) return;
      const row = rows.get(key);
      if (row?.status === "PENDING") rows.delete(key);
    },
  };
}

export function createPrismaAccessStore(db: PrismaClient = prismaClient): AccessStore {
  return {
    async getByEmail(email) {
      const row = await db.portalAccess.findUnique({ where: { email: normalizeEmail(email) } });
      if (!row || (row.status !== "PENDING" && row.status !== "ENABLED")) return null;
      return { email: row.email, status: row.status, createdAt: row.createdAt };
    },
    async list() {
      const rows = await db.portalAccess.findMany({
        orderBy: [{ createdAt: "asc" }, { email: "asc" }],
      });
      return splitList(
        rows.flatMap((row) =>
          row.status === "PENDING" || row.status === "ENABLED"
            ? [{ email: row.email, status: row.status, createdAt: row.createdAt }]
            : []
        )
      );
    },
    async request(email) {
      const key = writableEmail(email, "skip");
      if (!key) return;
      await db.$executeRaw`
        INSERT INTO "PortalAccess" ("email", "status", "createdAt")
        VALUES (${key}, 'PENDING'::"AccessStatus", CURRENT_TIMESTAMP)
        ON CONFLICT ("email") DO NOTHING
      `;
    },
    async enable(email) {
      const key = writableEmail(email, "skip");
      if (!key) return;
      await db.$executeRaw`
        INSERT INTO "PortalAccess" ("email", "status", "createdAt")
        VALUES (${key}, 'ENABLED'::"AccessStatus", CURRENT_TIMESTAMP)
        ON CONFLICT ("email") DO UPDATE SET "status" = 'ENABLED'::"AccessStatus"
      `;
    },
    async removeEnabled(email) {
      const key = writableEmail(email, "reject");
      if (!key) return;
      await db.portalAccess.deleteMany({ where: { email: key, status: "ENABLED" } });
    },
    async dismissPending(email) {
      const key = writableEmail(email, "skip");
      if (!key) return;
      await db.portalAccess.deleteMany({ where: { email: key, status: "PENDING" } });
    },
  };
}

export interface EmailCache {
  get(userId: string): string | undefined;
  set(userId: string, email: string): void;
}

export function createEmailCache(now: () => number = Date.now): EmailCache {
  const entries = new Map<string, { email: string; expiresAt: number }>();
  return {
    get(userId) {
      const hit = entries.get(userId);
      if (!hit) return undefined;
      if (hit.expiresAt <= now()) {
        entries.delete(userId);
        return undefined;
      }
      return hit.email;
    },
    set(userId, email) {
      if (!userId || !email) return;
      entries.set(userId, { email, expiresAt: now() + EMAIL_TTL_MS });
    },
  };
}

export async function resolveEmail(
  userId: string,
  claim: string | undefined,
  cache: EmailCache,
  lookup: (userId: string) => Promise<string | null>
): Promise<string | null> {
  const fromClaim = normalizeEmail(claim ?? "");
  if (validEmail(fromClaim)) {
    cache.set(userId, fromClaim);
    return fromClaim;
  }
  const cached = cache.get(userId);
  if (cached && validEmail(cached)) return cached;
  let lookedUp: string | null = null;
  try {
    lookedUp = await lookup(userId);
  } catch {
    // Clerk failures stay empty. Do not log the request or response.
    lookedUp = null;
  }
  const email = normalizeEmail(lookedUp ?? "");
  if (!validEmail(email)) return null;
  cache.set(userId, email);
  return email;
}

export async function roleForEmail(email: string, access: AccessStore): Promise<PortalRole> {
  if (isSuperadminEmail(email)) return "superadmin";
  const row = await access.getByEmail(email);
  if (row?.status === "PENDING") return "pending";
  if (row?.status === "ENABLED") return "member";
  return "none";
}

interface ClerkEmailAddress {
  id: string;
  email: string;
}

/** Reads the primary address. Does not log the payload. */
export function primaryEmailFromClerkUser(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { primary_email_address_id?: unknown; email_addresses?: unknown };
  if (!Array.isArray(record.email_addresses)) return null;
  const addresses: ClerkEmailAddress[] = [];
  for (const item of record.email_addresses) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; email_address?: unknown };
    if (typeof row.email_address !== "string") continue;
    addresses.push({ id: typeof row.id === "string" ? row.id : "", email: row.email_address });
  }
  const primaryId = typeof record.primary_email_address_id === "string" ? record.primary_email_address_id : "";
  const chosen = (primaryId ? addresses.find((item) => item.id === primaryId) : undefined) ?? addresses[0];
  if (!chosen) return null;
  const email = normalizeEmail(chosen.email);
  return validEmail(email) ? email : null;
}

export async function lookupClerkPrimaryEmail(
  userId: string,
  secretKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  if (!secretKey || !userId) return null;
  let res: globalThis.Response;
  try {
    res = await fetchImpl(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secretKey}` },
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) {
    try {
      await res.body?.cancel();
    } catch {
      // Ignore a failed drain. The body is never logged.
    }
    return null;
  }
  try {
    return primaryEmailFromClerkUser(await res.json());
  } catch {
    return null;
  }
}

export function portalFrom(res: Response): PortalIdentity {
  const portal = res.locals.portal as PortalIdentity | undefined;
  if (!portal?.userId || !portal.email || !portal.role) {
    throw new ApiError("UNAUTHORIZED", "Authentication required");
  }
  return portal;
}

export function createPortalGate(options: {
  access: AccessStore;
  lookupClerkEmail: (userId: string) => Promise<string | null>;
  ensureUser: (userId: string, email: string) => Promise<void>;
  cache?: EmailCache;
}) {
  const cache = options.cache ?? createEmailCache();

  const identify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) throw new ApiError("UNAUTHORIZED", "Authentication required");
      const email = await resolveEmail(userId, req.userEmail, cache, options.lookupClerkEmail);
      if (!email) throw new ApiError("UNAUTHORIZED", "Authentication required");
      const role = await roleForEmail(email, options.access);
      const portal: PortalIdentity = { userId, email, role };
      res.locals.portal = portal;
      next();
    } catch (err) {
      next(err);
    }
  };

  const touchAllowed = async (res: Response): Promise<void> => {
    const portal = portalFrom(res);
    if (portal.role === "superadmin" || portal.role === "member") {
      await options.ensureUser(portal.userId, portal.email);
    }
  };

  const requireProduct = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const portal = portalFrom(res);
      if (portal.role !== "superadmin" && portal.role !== "member") {
        throw new ApiError("FORBIDDEN", ACCESS_NOT_GRANTED);
      }
      await options.ensureUser(portal.userId, portal.email);
      next();
    } catch (err) {
      next(err);
    }
  };

  const requireSuperadmin = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const portal = portalFrom(res);
      if (portal.role !== "superadmin") throw new ApiError("FORBIDDEN", "Forbidden");
      await options.ensureUser(portal.userId, portal.email);
      next();
    } catch (err) {
      next(err);
    }
  };

  return { identify, requireProduct, requireSuperadmin, touchAllowed };
}
