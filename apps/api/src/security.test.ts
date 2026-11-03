import crypto from "crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp, PUBLIC_ROUTES } from "./app";
import { createTestDeps, createTestKeys } from "./testUtils";

interface RouteInfo {
  method: string;
  path: string;
}

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
  name?: string;
}

/** Walks the Express router so a newly added route cannot silently skip this test. */
function listRoutes(app: ReturnType<typeof createApp>): RouteInfo[] {
  const root = (app as unknown as { router: { stack: Layer[] } }).router.stack;
  const routes: RouteInfo[] = [];
  const walk = (stack: Layer[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({ method: method.toUpperCase(), path: prefix + layer.route.path });
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        walk(layer.handle.stack, "/v1");
      }
    }
  };
  walk(root, "");
  return routes;
}

const keys = createTestKeys();

describe("auth coverage", () => {
  const { deps } = createTestDeps(keys.publicKey);
  const app = createApp(deps);
  const routes = listRoutes(app);

  it("discovers the versioned API routes", () => {
    expect(routes.length).toBeGreaterThan(10);
    expect(routes).toContainEqual({ method: "POST", path: "/v1/projects" });
    expect(routes).toContainEqual({ method: "GET", path: "/v1/runs/:runId/events" });
  });

  const protectedRoutes = routes.filter((r) => !PUBLIC_ROUTES.has(`${r.method} ${r.path}`));
  const concrete = (path: string) => path.replace(/:[A-Za-z]+/g, crypto.randomUUID());

  it.each(protectedRoutes)("$method $path rejects requests without a token", async ({ method, path }) => {
    const res = await request(app)[method.toLowerCase() as "get"](concrete(path));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it.each(protectedRoutes)("$method $path rejects a token from an unauthorized party", async ({ method, path }) => {
    const token = keys.sign("user_evil", "https://evil.example");
    const res = await request(app)[method.toLowerCase() as "get"](concrete(path)).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("does not accept ?token= outside the SSE route", async () => {
    const token = keys.sign("user_a");
    const res = await request(app).get(`/v1/projects?token=${token}`);
    expect(res.status).toBe(401);
  });

  it("keeps health public", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });

  it("only allows configured CORS origins", async () => {
    const good = await request(app).options("/v1/projects").set("Origin", "http://localhost:3000");
    expect(good.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    const bad = await request(app).options("/v1/projects").set("Origin", "https://evil.example");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("rate limiting", () => {
  it("returns 429 with resetAt in the error envelope", async () => {
    const resetAt = new Date(Date.now() + 30_000);
    const { deps } = createTestDeps(keys.publicKey, {
      consumeRateLimit: async () => ({ allowed: false, remaining: 0, resetAt }),
    });
    const res = await request(createApp(deps)).get("/v1/projects");
    expect(res.status).toBe(429);
    expect(res.body.error).toMatchObject({ code: "RATE_LIMITED", resetAt: resetAt.toISOString() });
    expect(res.headers["retry-after"]).toBeDefined();
  });
});
