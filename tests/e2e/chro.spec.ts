import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

/**
 * The CHRO tab without calling Opus (that is a minute of model time): the
 * readiness banner reads the seed, a reviewer adds a question of their own,
 * drops it, keeps it. Generation itself is covered by scripts/chro-preview.ts.
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

const QUESTION = "E2E smoke: how will the demerger change who owns HR policy?";

test.describe("CHRO discovery questions", () => {
  test.afterAll(() => {
    execFileSync("node", ["scripts/e2e-cleanup.mjs"], { stdio: "inherit" });
  });

  test("the tab reads readiness from the seed and lets a reviewer add, drop and keep a question", async ({ page }) => {
    await signIn(page, "reviewer");
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Apex Manufacturing — HRMS implementation RFP/ }).click();
    await page.getByRole("link", { name: "CHRO questions" }).click();
    await expect(page).toHaveURL(/\/chro$/);

    // The shared demo drifts with real use: either side of the 80 % bar is fine, but a reviewer never gets the generate button.
    await expect(page.getByText(/% approved/)).toBeVisible();
    await expect(page.getByText(/Sharpest once 80%|Ready for discovery/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate with Claude" })).toHaveCount(0);

    await page.getByRole("button", { name: "Add a question" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Question").fill(QUESTION);
    await dialog.getByRole("button", { name: "Add and keep" }).click();
    await expect(page.getByText("Question added and kept")).toBeVisible({ timeout: 15_000 });
    const card = page.getByRole("listitem").filter({ hasText: QUESTION });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByRole("radio", { name: "Keep" })).toHaveAttribute("data-state", "on");

    const droppedBefore = Number((await page.getByText(/\d+ dropped/).innerText()).replace(/\D/g, ""));
    await card.getByRole("radio", { name: "Drop" }).click();
    await expect(card.getByRole("radio", { name: "Drop" })).toHaveAttribute("data-state", "on");
    await expect(page.getByText(new RegExp(`${droppedBefore + 1} dropped`))).toBeVisible();

    await card.getByRole("radio", { name: "Keep" }).click();
    await expect(card.getByRole("radio", { name: "Keep" })).toHaveAttribute("data-state", "on");
  });
});
