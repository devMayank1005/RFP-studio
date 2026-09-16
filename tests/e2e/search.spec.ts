import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

/**
 * ⌘K: opens from the top bar and the keyboard, finds RFPs and questions
 * across the workspace, and lands on the right screen. Nothing is written,
 * so there is nothing to clean up.
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

const palette = (page: Page) => page.getByRole("dialog", { name: "Command palette" });

async function openPalette(page: Page) {
  // The listener attaches on hydration; retry until the dialog answers.
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

test.describe("Command palette", () => {
  test("opens from the top-bar button and the keyboard, and closes on Escape", async ({ page }) => {
    await signIn(page, "consultant");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Search RFPs, questions/ }).click();
    await expect(palette(page)).toBeVisible();
    await expect(palette(page).getByRole("option", { name: /Dashboard/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette(page)).toBeHidden();
    await openPalette(page);
    await page.keyboard.press("Escape");
    await expect(palette(page)).toBeHidden();
  });

  test("finds an RFP by name and opens it", async ({ page }) => {
    await signIn(page, "consultant");
    await page.goto("/dashboard");
    await openPalette(page);
    await palette(page).getByRole("combobox").fill("Apex Manufacturing — HRMS");
    const hit = palette(page).getByRole("option", { name: /Apex Manufacturing — HRMS implementation RFP/ });
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(page).toHaveURL(/\/rfps\/[0-9a-f-]+\/workspace$/);
    await expect(page.getByRole("grid")).toBeVisible();
  });

  test("finds a question by its ref and selects that row", async ({ page }) => {
    await signIn(page, "consultant");
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Apex Manufacturing — HRMS implementation RFP/ }).click();
    await expect(page.getByRole("grid")).toBeVisible();
    await openPalette(page);
    await palette(page).getByRole("combobox").fill("A.1");
    const hit = palette(page).getByRole("option", { name: /^A\.1\s/ }).first();
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(page).toHaveURL(/\/workspace\?row=[0-9a-f-]+/);
    await expect(page.locator('[role="row"][tabindex="0"]').first().locator('[role="gridcell"]').nth(1)).toHaveText("A.1", { timeout: 15_000 });
    // The deep link survives the workspace's own URL sync: still there a moment later.
    await page.waitForTimeout(1_500);
    await expect(page).toHaveURL(/\/workspace\?row=[0-9a-f-]+/);
  });

  test("says when nothing matches, and typing in it never drives the grid", async ({ page }) => {
    await signIn(page, "consultant");
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Apex Manufacturing — HRMS implementation RFP/ }).click();
    await expect(page.getByRole("grid")).toBeVisible();
    await openPalette(page);
    // "j" and "a" are grid hotkeys; inside the palette they are just letters.
    await palette(page).getByRole("combobox").pressSequentially("ja zzzz");
    await expect(palette(page).getByText("No results.")).toBeVisible();
    await expect(page.locator('[role="row"][tabindex="0"]')).toHaveCount(0);
  });

  test("the search route refuses anonymous requests", async ({ request }) => {
    const res = await request.get("/api/search?q=apex");
    expect(res.status()).toBe(401);
  });
});
