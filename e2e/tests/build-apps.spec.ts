import { expect, test, type Page } from "@playwright/test";

const fakeAgent = process.env.E2E_FAKE_AGENT === "1";

/** Three deliberately different stacks: the platform must not assume any of them. */
const scenarios = [
  {
    name: "static landing page",
    prompt: "Build a single-page static HTML landing page for a bakery called Crumb with a menu section. No build step.",
    expectInPreview: /crumb/i,
  },
  {
    name: "React single-page app",
    prompt: "Build a Vite + React todo list app where I can add and check off todos. Start the dev server and set the preview.",
    expectInPreview: /todo/i,
  },
  {
    name: "Python web API",
    prompt: "Build a tiny Python FastAPI service with GET / returning an HTML page that says 'Hello from FastAPI'. Run it and set the preview.",
    expectInPreview: /hello from fastapi/i,
  },
];

async function startProject(page: Page, prompt: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("textbox", { name: /describe/i }).fill(prompt);
  await page.getByRole("button", { name: /^build$/i }).click();
  await expect(page).toHaveURL(/\/projects?\/[0-9a-f-]{36}/);
}

async function waitForRunToFinish(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: /stop active run/i })).toBeHidden({
    timeout: Number(process.env.E2E_RUN_TIMEOUT_MS || 10 * 60_000),
  });
}

for (const scenario of scenarios) {
  test(`builds a ${scenario.name}`, async ({ page }) => {
    await startProject(page, scenario.prompt);
    await expect(page.getByText(scenario.prompt.slice(0, 40), { exact: false }).first()).toBeVisible();
    await waitForRunToFinish(page);

    if (fakeAgent) {
      await expect(page.getByText(/open the preview/i).first()).toBeVisible();
      return;
    }

    const preview = page.frameLocator("iframe[title*='preview' i]");
    await expect(preview.locator("body")).toContainText(scenario.expectInPreview, { timeout: 120_000 });
  });
}

test("follow-up message continues the same project", async ({ page }) => {
  await startProject(page, "Build a static page that says Version One.");
  await waitForRunToFinish(page);
  const url = page.url();

  await page.getByRole("textbox").last().fill("Change the heading to say Version Two.");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
  await expect(page.getByText("Change the heading to say Version Two.").first()).toBeVisible();
  await waitForRunToFinish(page);
  expect(page.url()).toBe(url);
});
