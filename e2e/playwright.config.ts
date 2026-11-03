import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against a fully deployed stack (web, api, worker, sandbox-controller).
 * Required env: E2E_BASE_URL, CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY,
 * E2E_CLERK_USER_USERNAME, E2E_CLERK_USER_PASSWORD.
 * Set E2E_FAKE_AGENT=1 when the worker runs with AGENT_PROVIDER=fake.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: Number(process.env.E2E_RUN_TIMEOUT_MS || 10 * 60_000),
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--host-resolver-rules=MAP *.sandbox.local 127.0.0.1"],
    },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.clerk/user.json" },
      dependencies: ["setup"],
    },
  ],
});
