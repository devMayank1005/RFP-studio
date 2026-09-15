import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

/**
 * The story a reviewer lives: open the pipeline, open an RFP, move through the
 * grid with the keyboard, read the panel, approve, undo. Runs against the
 * seeded demo RFP, so it needs `pnpm db:seed` to have run.
 */

function mintSession(role = "consultant"): { name: string; value: string } {
  const out = execFileSync("node", ["scripts/dev-session.mjs", role], { encoding: "utf8" });
  // dotenv prints tips containing braces before the JSON; anchor on the payload itself.
  const match = /\{\s*"cookieName"[\s\S]*\}/.exec(out);
  if (!match) throw new Error(`dev-session.mjs printed no session JSON:\n${out}`);
  const parsed = JSON.parse(match[0]) as { cookieName: string; cookieValue: string };
  return { name: parsed.cookieName, value: parsed.cookieValue };
}

async function signIn(page: Page) {
  const cookie = mintSession();
  await page.context().addCookies([{ name: cookie.name, value: cookie.value, url: "http://localhost:3001" }]);
}

test.describe("RFP Studio smoke", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("dashboard lists the pipeline with the demo RFP", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "RFP pipeline" })).toBeVisible();
    await expect(page.getByText("Apex Manufacturing — HRMS implementation RFP (demo)")).toBeVisible();
    await expect(page.getByText("Open RFPs")).toBeVisible();
  });

  test("workspace: keyboard review loop", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Apex Manufacturing — HRMS implementation RFP/ }).click();
    await expect(page).toHaveURL(/\/workspace/);
    await expect(page.getByRole("grid")).toBeVisible();

    // J activates the first triaged row and the panel follows.
    await page.keyboard.press("j");
    await expect(page).toHaveURL(/row=/);
    await expect(page.getByRole("tab", { name: "Response" })).toBeVisible();
    const activeRef = await page.locator('[role="row"][tabindex="0"]').first().locator('[role="gridcell"]').nth(1).innerText();
    expect(activeRef).toMatch(/^[A-Z]\.\d+$/);

    // The question tab shows the client's own columns.
    await page.getByRole("tab", { name: "Question" }).click();
    await expect(page.getByText("Every client column")).toBeVisible();
    await page.getByRole("tab", { name: "Response" }).click();

    // ? opens the cheat sheet, Esc closes it.
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Keyboard" })).toBeHidden();
  });

  test("workspace: approve and unapprove a drafted row", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Apex Manufacturing — HRMS implementation RFP/ }).click();
    await expect(page.getByRole("grid")).toBeVisible();

    // Pick an AI draft via the status facet, activate it, approve with A.
    await page.getByRole("button", { name: /AI draft/ }).first().click();
    await page.keyboard.press("j");
    // Scope to the panel: the status facet is also a button whose name starts with "Approve…".
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("button", { name: /^Approve/ })).toBeVisible();
    await page.keyboard.press("a");
    await expect(panel.getByRole("button", { name: "Unapprove" })).toBeVisible();

    // And back, so the seed stays as it was.
    await panel.getByRole("button", { name: "Unapprove" }).click();
    await expect(panel.getByRole("button", { name: /^Approve/ })).toBeVisible();
  });

  test("new RFP form validates and creates a draft", async ({ page }) => {
    await page.goto("/rfps/new");
    await expect(page.getByRole("heading", { name: "New RFP" })).toBeVisible();
    await page.getByLabel("Title").fill("E2E smoke RFP");
    await page.getByRole("button", { name: "Create and upload files" }).click();
    await expect(page).toHaveURL(/\/setup\/upload/);
    await expect(page.getByText("Upload the RFP")).toBeVisible();
  });
});
