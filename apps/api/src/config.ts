export interface ApiConfig {
  port: number;
  databaseUrl: string;
  internalToken: string;
  controllerUrl: string;
  clerkPublicKey: string;
  clerkAuthorizedParties: string[];
  clerkIssuer?: string;
  corsOrigins: string[];
  rateLimitPerMinute: number;
  dailyTokenQuota: number;
  dailyRunQuota: number;
  /** Used only to resolve a Clerk user's primary email. Optional when the JWT already carries email. */
  clerkSecretKey?: string;
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const missing = [
    "DATABASE_URL",
    "INTERNAL_API_TOKEN",
    "CONTROLLER_URL",
    "CLERK_JWT_PUBLIC_KEY",
    "CLERK_AUTHORIZED_PARTIES",
  ].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  return {
    port: Number(env.PORT || 8080),
    databaseUrl: env.DATABASE_URL!,
    internalToken: env.INTERNAL_API_TOKEN!,
    controllerUrl: env.CONTROLLER_URL!,
    clerkPublicKey: env.CLERK_JWT_PUBLIC_KEY!,
    clerkAuthorizedParties: list(env.CLERK_AUTHORIZED_PARTIES),
    clerkIssuer: env.CLERK_ISSUER || undefined,
    corsOrigins: list(env.CORS_ORIGINS),
    rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE || 120),
    dailyTokenQuota: Number(env.DAILY_TOKEN_QUOTA || 2_000_000),
    dailyRunQuota: Number(env.DAILY_RUN_QUOTA || 200),
    clerkSecretKey: env.CLERK_SECRET_KEY || undefined,
  };
}
