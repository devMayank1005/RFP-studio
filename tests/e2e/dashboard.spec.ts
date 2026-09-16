import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

/**
 * The dashboard and the way into an RFP. Each case here was a real defect:
 * a tab that 404'd, a draft that opened an empty grid, a bare Next 404 page,
 * a malformed id that produced a 500, and a table clipped at laptop width.
 */

function mintSession(role = "consultant"): { name: string; value: string } {
  const out = execFileSync("node", ["scripts/dev-session.mjs", role], { encoding: "utf8" });
  const match = /\{\s*"cookieName"[\s\S]*\}/.exec(out);
  if (!match) throw new Error(`dev-session.mjs printed no session JSON:\n${out}`);
  const parsed = JSON.parse(match[0]) as { cookieName: string; cookieValue: string };
  return { name: parsed.cookieName, value: parsed.cookieValue };
}

async function signIn(page: Page) {
  const cookie = mintSession();
  await page.context().addCookies([{ name: cookie.name, value: cookie.value, url: "http://localhost:3001" }]);
}

test.describe("Dashboard and RFP entry points", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the Setup tab opens the RFP's current setup step, never a 404", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Apex Manufacturing — HRMS implementation RFP/ }).click();
    await expect(page.getByRole("grid")).toBeVisible();
    await page.getByRole("link", { name: "Setup" }).click();
    // The redirect page compiles on first hit in dev; allow for that.
    await expect(page).toHaveURL(/\/setup\/questions$/, { timeout: 30_000 });
    await expect(page.getByText("This page could not be found")).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Setup steps" })).toBeVisible();
  });

  test("a draft RFP opens at its upload step, not an empty review grid", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /^Vedanta — HR transformation requirements/ }).click();
    await expect(page).toHaveURL(/\/setup\/upload$/, { timeout: 30_000 });
    await expect(page.getByText("Upload the RFP")).toBeVisible();
  });

  test("an unknown URL shows the branded not-found page", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByRole("heading", { name: "That page isn't here" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the pipeline" })).toBeVisible();
  });

  test("a malformed RFP id is a 404, not a server error", async ({ page }) => {
    const response = await page.goto("/rfps/not-a-uuid/workspace");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("That RFP isn't here")).toBeVisible();
  });

  test("the pipeline table stays readable at laptop width", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto("/dashboard");
    await expect(page.getByRole("columnheader", { name: "Updated" })).toBeHidden();
    await expect(page.getByRole("columnheader", { name: "Questions" })).toBeHidden();
    await expect(page.getByRole("columnheader", { name: "Approved" })).toBeVisible();
    // Nothing spills past the card: the remaining columns fit without a horizontal scroll.
    const overflow = await page.locator("table").evaluate((table) => {
      const wrapper = table.parentElement!;
      return wrapper.scrollWidth - wrapper.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
