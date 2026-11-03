import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

export interface VerifyUserTokenOptions {
  publicKey: string;
  authorizedParties?: string[];
  issuer?: string;
}

export interface VerifiedUserClaims {
  userId: string;
  email?: string;
  azp?: string;
}

export function verifyUserJwt(
  token: string,
  options: VerifyUserTokenOptions
): VerifiedUserClaims {
  if (!token || token === "null" || token === "undefined") {
    throw new Error("Missing token");
  }
  const normalizedKey = options.publicKey.replace(/\\n/g, "\n");
  const verifyOptions: jwt.VerifyOptions = {
    algorithms: ["RS256"],
    ...(options.issuer ? { issuer: options.issuer } : {}),
  };

  const decoded = jwt.verify(token, normalizedKey, verifyOptions);
  if (!decoded || typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }
  const payload = decoded as JwtPayload & {
    azp?: string;
    email?: string;
  };
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Token missing subject (sub)");
  }

  if (options.authorizedParties && options.authorizedParties.length > 0) {
    if (!payload.azp || !options.authorizedParties.includes(payload.azp)) {
      throw new Error("Token authorized party (azp) is not permitted");
    }
  }

  return {
    userId: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    azp: payload.azp,
  };
}

export interface UserAuthMiddlewareOptions extends VerifyUserTokenOptions {
  onAuthenticated?: (claims: VerifiedUserClaims) => Promise<void> | void;
  allowQueryToken?: boolean;
}

export function createUserAuthMiddleware(options: UserAuthMiddlewareOptions) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      let token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : undefined;

      if (!token && options.allowQueryToken && typeof req.query.token === "string") {
        token = req.query.token;
      }

      if (!token) {
        res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        });
        return;
      }

      const claims = verifyUserJwt(token, options);
      req.userId = claims.userId;
      req.userEmail = claims.email;

      if (options.onAuthenticated) {
        await options.onAuthenticated(claims);
      }
      next();
    } catch {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or expired authentication token",
        },
      });
    }
  };
}

export function constantTimeTokenEquals(actual: string, expected: string): boolean {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createInternalTokenMiddleware(expectedToken: string) {
  if (!expectedToken || expectedToken.length < 16) {
    throw new Error(
      "INTERNAL_API_TOKEN must be configured with at least 16 characters"
    );
  }
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("x-internal-token") || "";
    if (!constantTimeTokenEquals(header, expectedToken)) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid internal service token",
        },
      });
      return;
    }
    next();
  };
}

export type ProjectLookupFn<TProject = unknown> = (
  projectId: string,
  userId: string
) => Promise<TProject | null>;

export function createProjectOwnershipGuard<TProject>(
  lookup: ProjectLookupFn<TProject>,
  paramName = "projectId"
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const userId = req.userId;
    const rawProjectId: string | string[] | undefined = req.params[paramName];
    const projectId = typeof rawProjectId === "string" ? rawProjectId : undefined;
    if (!userId) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }
    if (!projectId) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: `Missing ${paramName}` },
      });
      return;
    }
    const project = await lookup(projectId, userId);
    if (!project) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Project not found" },
      });
      return;
    }
    (req as Request & { project?: TProject }).project = project;
    next();
  };
}

export function generateRandomSessionToken(): {
  rawToken: string;
  tokenHash: string;
} {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(rawToken);
  return { rawToken, tokenHash };
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken, "utf-8").digest("hex");
}
