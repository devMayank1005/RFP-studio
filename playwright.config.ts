import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests against a running dev server (`pnpm dev --port 3001`). They
 * sign in by minting a real Better Auth session with scripts/dev-session.mjs
 * — there is no password path and no bypass in app code.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // One worker: every spec shares the development database and the cleanup script; two files
  // running side by side would delete each other's rows mid-test.
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
