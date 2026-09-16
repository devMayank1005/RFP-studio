import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

/**
 * Quick Q&A without the model: the form validates, a paste starts a session
 * that shows its progress, the session lists here and not on the pipeline,
 * and a reviewer cannot start one. Drafting itself (Claude + Inngest) runs
 * only when E2E_WITH_MODEL is set.
 */

function mintSession(role = "consultant"): { name: string; value: string } {
  const out = execFileSync("node", ["scripts/dev-session.mjs", role], { encoding: "utf8" });
  const match = /\{\s*"cookieName"[\s\S]*\}/.exec(out);
  if (!match) throw new Error(`dev-session.mjs printed no session JSON:\n${out}`);
  const parsed = JSON.parse(match[0]) as { cookieName: string; cookieValue: string };
  return { name: parsed.cookieName, value: parsed.cookieValue };
}

async function signIn(page: Page, role = "consultant") {
  const cookie = mintSession(role);
  await page.context().addCookies([{ name: cookie.name, value: cookie.value, url: "http://localhost:3001" }]);
}

const CONTEXT = "E2E quick session — retail client, 2,000 staff";
const QUESTIONS = "Does the platform support shift rostering across multiple plants?\nHow is payroll reconciled at month end?";

test.describe("Quick Q&A", () => {
  let inngestUp = false;

  test.beforeAll(async ({ request }) => {
    inngestUp = await request
      .get("http://localhost:8288/")
      .then((r) => r.ok())
      .catch(() => false);
  });

  test.afterAll(() => {
    execFileSync("node", ["scripts/e2e-cleanup.mjs"], { stdio: "inherit" });
  });

  test("the form refuses an empty paste", async ({ page }) => {
    await signIn(page, "consultant");
    await page.goto("/quick");
    await expect(page.getByRole("heading", { name: "Quick Q&A" })).toBeVisible();
    await page.getByRole("button", { name: "Draft responses" }).click();
    await expect(page.getByText("Paste at least one question.")).toBeVisible();
    await expect(page).toHaveURL(/\/quick$/);
  });

  test("pasting questions starts a session that shows its progress and stays off the pipeline", async ({ page }) => {
    test.skip(!inngestUp, "needs the local Inngest dev server: pnpm inngest:dev");
    await signIn(page, "consultant");
    await page.goto("/quick");
    await page.getByLabel("Questions", { exact: true }).fill(QUESTIONS);
    await page.getByLabel("Deal context").fill(CONTEXT);
    await page.getByRole("button", { name: "Draft responses" }).click();
    await expect(page).toHaveURL(/\/quick\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: CONTEXT })).toBeVisible();
    await expect(page.getByText(/Reading the questions|Drafting responses|starting the drafts|Not drafted yet/).first()).toBeVisible({ timeout: 15_000 });

    if (process.env.E2E_WITH_MODEL) {
      await expect(page.getByText("AI draft").first()).toBeVisible({ timeout: 180_000 });
      await page.getByRole("button", { name: "Add to knowledge base" }).first().click();
      await expect(page.getByText("In knowledge base").first()).toBeVisible({ timeout: 60_000 });
    }

    await page.goto("/quick");
    await expect(page.getByRole("list", { name: "Quick Q&A sessions" }).getByText(CONTEXT)).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByText(CONTEXT)).toHaveCount(0);
  });

  test("a reviewer can look but not start a session", async ({ page }) => {
    await signIn(page, "reviewer");
    await page.goto("/quick");
    await expect(page.getByRole("button", { name: "Draft responses" })).toHaveCount(0);
    await expect(page.getByText(/not start them/)).toBeVisible();
  });
});
