import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/** Clerk finishes Google OAuth here. It must stay public. */
const isPublicRoute = createRouteMatcher(["/sso-callback(.*)"]);
const isProtectedRoute = createRouteMatcher(["/project(.*)", "/projects(.*)", "/access(.*)"]);

const isDev = process.env.NODE_ENV !== "production";

/** The Clerk Frontend API host is base64-encoded inside the publishable key. */
function clerkFrontendApiOrigin(publishableKey: string): string | null {
  try {
    const encoded = publishableKey.split("_")[2] ?? "";
    const host = atob(encoded).replace(/\$$/, "");
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
  } catch {
    return null;
  }
}

function buildCsp(): string {
  const clerkFapi = clerkFrontendApiOrigin(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const clerk = [clerkFapi, "https://*.clerk.accounts.dev", "https://*.clerk.com"].filter(
    Boolean
  ) as string[];
  const apiOrigin = new URL(env.NEXT_PUBLIC_API_URL).origin;
  const sandboxDomain = env.NEXT_PUBLIC_SANDBOX_BASE_DOMAIN;
  const sandboxFrames = sandboxDomain
    ? [`https://*.${sandboxDomain}`, ...(isDev ? [`http://*.${sandboxDomain}`] : [])]
    : [];
  const turnstile = "https://challenges.cloudflare.com";

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : []), ...clerk, turnstile],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://img.clerk.com"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", apiOrigin, ...clerk, "https://clerk-telemetry.com", ...(isDev ? ["ws:"] : [])],
    "frame-src": ["'self'", ...sandboxFrames, ...clerk, turnstile],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", ...clerk, "https://accounts.google.com"],
    "frame-ancestors": ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

const CSP = buildCsp();

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request) && isProtectedRoute(request)) {
    await auth.protect();
  }

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", CSP);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (!isDev) {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
