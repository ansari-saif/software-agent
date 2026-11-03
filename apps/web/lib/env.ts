import { z } from "zod";

const EnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z
    .string()
    .url("NEXT_PUBLIC_API_URL must be a valid URL")
    .default("http://localhost:8080")
    .transform((v) => v.replace(/\/+$/, "")),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .regex(/^pk_(test|live)_/, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY looks invalid")
    .default("pk_test_Y2xlcmsuZXhhbXBsZS5jb20k"),
  NEXT_PUBLIC_SANDBOX_BASE_DOMAIN: z
    .string()
    .min(1)
    .regex(/^[a-z0-9.-]+$/i, "NEXT_PUBLIC_SANDBOX_BASE_DOMAIN must be a bare domain")
    .optional(),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function parseEnv(raw: Record<string, string | undefined>): AppEnv {
  const result = EnvSchema.safeParse(
    Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, v === "" ? undefined : v])
    )
  );
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${formatted}`);
  }
  return result.data;
}

// NEXT_PUBLIC_* values are inlined at build time, so each must be referenced literally.
export const env: AppEnv = parseEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SANDBOX_BASE_DOMAIN: process.env.NEXT_PUBLIC_SANDBOX_BASE_DOMAIN,
});

export const API_V1_URL = `${env.NEXT_PUBLIC_API_URL}/v1`;
