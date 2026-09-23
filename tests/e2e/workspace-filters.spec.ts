import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

/**
 * The workspace's filters are its URL. One spelling per state: a pasted or
 * hand-edited link is rewritten to its clean form, selecting every value of
 * a facet is the same as selecting none, and the counter counts groups.
 * Runs against the seeded demo RFP (`pnpm db:seed`).
 */

const DEMO_RFP = "dce70ec8-f92d-5b60-95b0-eb865002e637";

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

const facetRows = (page: Page, facet: string) => page.locator(`[data-facet="${facet}"] button[data-value]`);

test.describe("workspace filter URLs", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("a mangled link is rewritten to its canonical form and still shows the grid", async ({ page }) => {
    await page.goto(`/rfps/${DEMO_RFP}/workspace?compliance&owner=kognoz,darwinbox,not_applicable=fully,na`);
    await expect(page.getByRole("grid")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/rfps/${DEMO_RFP}/workspace\\?owner=kognoz,darwinbox$`));
    await expect(page.locator('[data-facet="owner"]')).toContainText("2 of 4");
    await expect(page.locator('[data-facet="compliance"]')).toContainText("All");
  });

  test("selecting every compliance level is no filter at all", async ({ page }) => {
    await page.goto(`/rfps/${DEMO_RFP}/workspace`);
    await expect(page.getByRole("grid")).toBeVisible();
    const rows = facetRows(page, "compliance");
    const n = await rows.count();
    expect(n).toBe(6);
    for (let i = 0; i < n - 1; i++) await rows.nth(i).click();
    await expect(page).toHaveURL(/compliance=/);
    await expect(page.locator('[data-facet="compliance"]')).toContainText(`${n - 1} of ${n}`);
    await rows.nth(n - 1).click();
    await expect(page).not.toHaveURL(/compliance/);
    await expect(page.locator('[data-facet="compliance"]')).toContainText("All");
    // The count reads "N questions", not "n of N": nothing is filtered.
    await expect(page.getByText(/\d+ questions ·/)).toBeVisible();
    await expect(page.getByText(/\d+ of \d+ ·/)).toHaveCount(0);
  });

  test("the counter counts filter groups, not values, and the URL is in facet order", async ({ page }) => {
    await page.goto(`/rfps/${DEMO_RFP}/workspace`);
    await expect(page.getByRole("grid")).toBeVisible();
    await page.locator('[data-facet="status"] button[data-value="approved"]').click();
    await page.locator('[data-facet="status"] button[data-value="undrafted"]').click();
    await page.locator('[data-facet="owner"] button[data-value="kognoz"]').click();
    await expect(page).toHaveURL(/\?status=undrafted,approved&owner=kognoz$/);
    await expect(page.getByRole("button", { name: "Clear 2 filters" })).toBeVisible();
    await page.locator('[data-facet="status"]').getByRole("button", { name: /Clear/ }).click();
    await expect(page).toHaveURL(/\?owner=kognoz$/);
    await expect(page.getByRole("button", { name: "Clear 1 filter" })).toBeVisible();
  });
});
