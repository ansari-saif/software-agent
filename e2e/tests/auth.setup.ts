import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";

/**
 * Signs in through the real Clerk UI (email + password) so the saved storage
 * state holds a refreshable session. The programmatic clerk.signIn() session
 * does not survive storage-state restore reliably in dev instances.
 */
setup("sign in test user", async ({ page }) => {
  const identifier = process.env.E2E_CLERK_USER_USERNAME;
  const password = process.env.E2E_CLERK_USER_PASSWORD;
  if (!identifier || !password) throw new Error("E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD are required");

  await setupClerkTestingToken({ page });
  await page.goto("/");

  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  await page.getByLabel(/email/i).first().fill(identifier);
  await page.getByRole("button", { name: /continue|sign in/i }).last().click();

  const passwordField = page.getByLabel(/password/i).first();
  await passwordField.waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
  if (await passwordField.isVisible().catch(() => false)) {
    await passwordField.fill(password);
    await page.getByRole("button", { name: /continue|sign in/i }).last().click();
  }

  await expect(page.getByRole("button", { name: /open user menu|account/i }).first()).toBeVisible({ timeout: 30_000 });
  await page.context().storageState({ path: "playwright/.clerk/user.json" });
});
