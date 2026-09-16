import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

/**
 * Exports: a consultant builds a fresh Excel workbook of the demo RFP through
 * the local Inngest dev server and downloads it; a reviewer cannot build. The
 * Word export calls Claude for its executive summary, so it is exercised by
 * the renderer unit tests and by hand, not here.
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

async function openDemoExports(page: Page) {
  await page.goto("/dashboard");
  await page.getByRole("link", { name: /Apex Manufacturing — HRMS implementation RFP/ }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  // The tab strip can still be hydrating under load; re-click until the route changes.
  await expect(async () => {
    await page.getByRole("link", { name: "Exports" }).click();
    await expect(page).toHaveURL(/\/exports$/, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe("Exports", () => {
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

  test("a consultant builds a fresh Excel export of the demo RFP and downloads it", async ({ page }) => {
    test.skip(!inngestUp, "needs the local Inngest dev server: pnpm inngest:dev");
    await signIn(page, "consultant");
    await openDemoExports(page);

    // The seed leaves some answers unapproved, so the band says so before anything is built.
    await expect(page.getByText(/% approved/)).toBeVisible();
    await expect(page.getByText(/unapproved answers will be exported as they stand/)).toBeVisible();

    await page.getByRole("button", { name: "Build Excel" }).click();
    await expect(page.getByText("Building the Excel export")).toBeVisible();
    await expect(page.getByText("Export ready").first()).toBeVisible({ timeout: 90_000 });

    const table = page.getByRole("table", { name: "Export history" });
    const row = table.getByRole("row").filter({ hasText: /\.xlsx/ }).first();
    await expect(row.getByText("Ready")).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText("Fresh workbook")).toBeVisible();

    const href = await row.getByRole("link", { name: /^Download/ }).getAttribute("href");
    expect(href).toMatch(/\/api\/rfps\/[0-9a-f-]+\/exports\/[0-9a-f-]+\/download$/);
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("spreadsheetml");
    expect(res.headers()["content-disposition"]).toMatch(/attachment; filename=".*\.xlsx"/);
    expect((await res.body()).subarray(0, 2).toString()).toBe("PK");
  });

  test("a consultant builds the Word export (needs Claude)", async ({ page }) => {
    test.skip(!inngestUp || !process.env.E2E_WITH_MODEL, "needs the local Inngest dev server and E2E_WITH_MODEL=1");
    await signIn(page, "consultant");
    await openDemoExports(page);
    await page.getByRole("button", { name: "Build Word" }).click();
    await expect(page.getByText("Building the Word export")).toBeVisible();
    await expect(page.getByText("Export ready").first()).toBeVisible({ timeout: 180_000 });
    const row = page.getByRole("table", { name: "Export history" }).getByRole("row").filter({ hasText: /\.docx/ }).first();
    await expect(row.getByText("Ready")).toBeVisible({ timeout: 15_000 });
    const href = await row.getByRole("link", { name: /^Download/ }).getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("wordprocessingml");
    expect((await res.body()).subarray(0, 2).toString()).toBe("PK");
  });

  test("a consultant fills in the client's own workbook (needs an RFP with a parsed .xlsx)", async ({ page }) => {
    const rfpId = process.env.E2E_FILL_RFP_ID;
    test.skip(!inngestUp || !rfpId, "set E2E_FILL_RFP_ID to an RFP whose original .xlsx questionnaire is parsed");
    await signIn(page, "consultant");
    await page.goto(`/rfps/${rfpId}/exports`);
    await expect(page.getByRole("button", { name: "Build Excel" })).toBeVisible();
    await page.getByRole("radio", { name: "Fill the client's file" }).click();
    await expect(page.getByText(/answers written into their own columns/)).toBeVisible();
    await page.getByRole("button", { name: "Build Excel" }).click();
    await expect(page.getByText("Export ready").first()).toBeVisible({ timeout: 180_000 });
    const row = page.getByRole("table", { name: "Export history" }).getByRole("row").filter({ hasText: /kognoz-response/ }).first();
    await expect(row.getByText("Client's workbook, filled in")).toBeVisible({ timeout: 15_000 });
    const href = await row.getByRole("link", { name: /^Download/ }).getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await res.body()) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toContain("Kognoz notes");
  });

  test("a reviewer sees the build buttons disabled with a reason", async ({ page }) => {
    await signIn(page, "reviewer");
    await openDemoExports(page);
    await expect(page.getByRole("button", { name: "Build Excel" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Build Word" })).toBeDisabled();
    // The deck has no button yet — only the "Later" chip.
    await expect(page.getByRole("button", { name: "Build deck" })).toHaveCount(0);
    await expect(page.getByText("Later", { exact: true })).toBeVisible();
    await expect(page.getByText(/cannot create exports/).first()).toBeVisible();
  });

  test("the download route refuses anonymous requests", async ({ request }) => {
    const res = await request.get("/api/rfps/00000000-0000-0000-0000-000000000000/exports/00000000-0000-0000-0000-000000000000/download");
    expect(res.status()).toBe(401);
  });
});
