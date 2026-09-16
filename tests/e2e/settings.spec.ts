import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

/**
 * Settings: roles change with a guard, the brand editor previews before it
 * saves, and non-admins see everything read-only. The brand is never saved
 * here — a test must not restyle the shared development app.
 */

function mintSession(role: string): { name: string; value: string } {
  const out = execFileSync("node", ["scripts/dev-session.mjs", role], { encoding: "utf8" });
  const match = /\{\s*"cookieName"[\s\S]*\}/.exec(out);
  if (!match) throw new Error(`dev-session.mjs printed no session JSON:\n${out}`);
  const parsed = JSON.parse(match[0]) as { cookieName: string; cookieValue: string };
  return { name: parsed.cookieName, value: parsed.cookieValue };
}

async function signIn(page: Page, role: string) {
  const cookie = mintSession(role);
  await page.context().addCookies([{ name: cookie.name, value: cookie.value, url: "http://localhost:3001" }]);
}

test.describe("Settings", () => {
  test.beforeAll(() => {
    // Make sure the consultant fixture user exists for the role-change case.
    mintSession("consultant");
  });
  test.afterAll(() => {
    execFileSync("node", ["scripts/e2e-cleanup.mjs"], { stdio: "inherit" });
  });

  test("an admin changes a teammate's role and back, and cannot demote the last admin", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/settings");
    await expect(page.getByRole("tab", { name: "Team" })).toBeVisible();
    const consultantRow = page.getByRole("row").filter({ hasText: "dev.consultant@rfp-studio.invalid" });
    await consultantRow.getByRole("combobox", { name: /Role for/ }).click();
    await page.getByRole("option", { name: "Reviewer" }).click();
    await expect(page.getByText(/is now reviewer/)).toBeVisible({ timeout: 15_000 });
    await consultantRow.getByRole("combobox", { name: /Role for/ }).click();
    await page.getByRole("option", { name: "Consultant" }).click();
    await expect(page.getByText(/is now consultant/)).toBeVisible({ timeout: 15_000 });

    // An admin's select is locked only while they are the last admin.
    const adminRow = page.getByRole("row").filter({ hasText: "dev.admin@rfp-studio.invalid" });
    const admins = await page.getByRole("combobox", { name: /Role for/ }).filter({ hasText: "Admin" }).count();
    if (admins <= 1) await expect(adminRow.getByRole("combobox", { name: /Role for/ })).toBeDisabled();
    else await expect(adminRow.getByRole("combobox", { name: /Role for/ })).toBeEnabled();
  });

  test("the brand editor previews a colour before it is saved", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/settings?tab=brand");
    const preview = page.getByLabel("Live preview");
    const before = await preview.getByRole("button", { name: "Approve" }).evaluate((b) => getComputedStyle(b).backgroundColor);
    await page.getByRole("textbox", { name: "Primary", exact: true }).fill("8b1e3f");
    await expect
      .poll(() => preview.getByRole("button", { name: "Approve" }).evaluate((b) => getComputedStyle(b).backgroundColor))
      .not.toBe(before);
    await expect(page.getByRole("button", { name: "Save brand" })).toBeEnabled();
    await expect(page.locator("#brand-style")).toHaveCount(0);
  });

  test("the voice guide tab shows the default guide with counts", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/settings?tab=voice");
    await expect(page.getByText("Default guide")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Voice guide" })).toContainText("Kognoz voice");
    await expect(page.getByRole("button", { name: "Reset to default" })).toBeDisabled();
  });

  test("a consultant sees settings read-only", async ({ page }) => {
    await signIn(page, "consultant");
    await page.goto("/settings?tab=brand");
    await expect(page.getByText(/Read-only — only admins change the brand/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save brand" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Team" }).click();
    await expect(page.getByRole("combobox", { name: /Role for/ })).toHaveCount(0);
  });
});
