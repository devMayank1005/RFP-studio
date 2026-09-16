import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

/**
 * The knowledge base screen from the keyboard: add an entry, find it, open
 * it, retire it, see it again under "Show inactive". Runs against the seeded
 * corpus; the entry it creates is removed by scripts/e2e-cleanup.mjs.
 */

const ENTRY_NAME = "E2E smoke capability";
const ENTRY_BODY = "Smoke-test passage: the platform supports this capability out of the box, configured per entity, with an audit trail of every change.";

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

const kbList = (page: Page) => page.getByRole("list", { name: "Knowledge base entries" });

test.describe("Knowledge base", () => {
  test.afterAll(() => {
    execFileSync("node", ["scripts/e2e-cleanup.mjs"], { stdio: "inherit" });
  });

  test("a consultant adds an entry, finds it, retires it and sees it under Show inactive", async ({ page }) => {
    await signIn(page);
    await page.goto("/kb");
    await expect(page.getByRole("heading", { name: "Knowledge base" })).toBeVisible();
    await expect(kbList(page)).toBeVisible();

    // N opens the editor; ⌘/Ctrl+Enter saves. The key lands only once React has attached the
    // listener, which can trail the first paint under load — so press until the sheet answers.
    const dialog = page.getByRole("dialog");
    await expect(async () => {
      await page.keyboard.press("n");
      await expect(dialog).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await dialog.getByLabel("Feature or service").fill(ENTRY_NAME);
    await dialog.getByLabel("Passage").fill(ENTRY_BODY);
    await dialog.getByLabel("Tags").fill("smoke, e2e");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(page.getByText("Entry added")).toBeVisible({ timeout: 30_000 });
    await expect(kbList(page).getByText(ENTRY_NAME)).toBeVisible({ timeout: 15_000 });

    // / focuses search; the list narrows to the one match.
    await page.keyboard.press("/");
    await page.keyboard.type("E2E smoke");
    await expect(kbList(page).getByRole("listitem")).toHaveCount(1, { timeout: 15_000 });

    // Enter on the focused row opens it; Deactivate retires it.
    await page.keyboard.press("Escape");
    await page.keyboard.press("j");
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("heading", { name: "Edit entry" })).toBeVisible();
    await dialog.getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText("Entry deactivated")).toBeVisible({ timeout: 15_000 });
    await expect(kbList(page).getByText(ENTRY_NAME)).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole("switch", { name: "Show inactive entries" }).click();
    await expect(kbList(page).getByText(ENTRY_NAME)).toBeVisible({ timeout: 15_000 });
    await expect(kbList(page).getByText("Inactive")).toBeVisible();
  });

  test("a too-short passage is refused with the reason on the field", async ({ page }) => {
    await signIn(page);
    await page.goto("/kb?entry=new");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Feature or service").fill("Short one");
    await dialog.getByLabel("Passage").fill("Too short.");
    await dialog.getByRole("button", { name: "Add entry" }).click();
    await expect(dialog.getByText(/Write at least 40 characters/)).toBeVisible({ timeout: 15_000 });
  });

  test("search follows the reader across tabs", async ({ page }) => {
    await signIn(page);
    await page.goto("/kb?q=payroll");
    await page.getByRole("link", { name: /Kognoz services/ }).click();
    await expect(page).toHaveURL(/tab=services/);
    await expect(page).toHaveURL(/q=payroll/);
  });

  test("a reviewer sees the corpus read-only", async ({ page }) => {
    await signIn(page, "reviewer");
    await page.goto("/kb");
    await expect(page.getByRole("button", { name: "New entry" })).toHaveCount(0);
    await kbList(page).getByRole("listitem").first().click();
    await expect(page.getByRole("dialog").getByText("Read-only")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Save" })).toHaveCount(0);
  });
});
