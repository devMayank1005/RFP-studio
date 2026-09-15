import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `next build` evaluates every route module while "collecting page data",
 * with whatever env the build happens to have. A preview deployment without
 * the SSO secrets must still build; only the first sign-in request may refuse
 * to run — and it must say why.
 */
const SSO_VARS = [
  "ALLOWED_EMAIL_DOMAINS",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_TENANT_ID",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
];

function stubCompleteSso() {
  vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "kognozconsulting.com");
  vi.stubEnv("MICROSOFT_CLIENT_ID", "client-id");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "client-secret");
  vi.stubEnv("MICROSOFT_TENANT_ID", "common");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3001");
  vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
}

describe("auth module", () => {
  beforeEach(() => {
    vi.resetModules();
    // The pool is constructed at import but only connects on the first query.
    vi.stubEnv("DATABASE_URL", "postgres://rfp:rfp@localhost:5432/rfp");
    for (const name of SSO_VARS) vi.stubEnv(name, "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("imports with no SSO configuration at all, so a build never needs the secrets", async () => {
    await expect(import("./auth")).resolves.toHaveProperty("getAuth");
  });

  it("refuses to construct the auth instance without an email allowlist", async () => {
    const { getAuth } = await import("./auth");
    expect(() => getAuth()).toThrow(/ALLOWED_EMAIL_DOMAINS/);
  });

  it("rejects a malformed tenant id before it reaches Microsoft's URLs", async () => {
    stubCompleteSso();
    vi.stubEnv("MICROSOFT_TENANT_ID", "not-a-guid");
    const { getAuth } = await import("./auth");
    expect(() => getAuth()).toThrow(/MICROSOFT_TENANT_ID/);
  });

  it("names the missing client secret", async () => {
    stubCompleteSso();
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "");
    const { getAuth } = await import("./auth");
    expect(() => getAuth()).toThrow(/MICROSOFT_CLIENT_SECRET/);
  });

  it("builds once the env is complete and hands back the same instance", async () => {
    stubCompleteSso();
    const { getAuth } = await import("./auth");
    const first = getAuth();
    expect(first.api.getSession).toBeTypeOf("function");
    expect(getAuth()).toBe(first);
  });
});
