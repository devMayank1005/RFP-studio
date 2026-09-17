import { describe, expect, it } from "vitest";

import { RATE_LIMITS, decide, rateLimitKey, rateLimitMessage } from "./rate-limit";

describe("rate limits", () => {
  const policy = { windowMs: 60_000, max: 3 };
  const start = new Date("2026-09-17T10:00:00Z");

  it("allows up to the maximum, inclusive", () => {
    expect(decide(policy, 1, start, start).allowed).toBe(true);
    expect(decide(policy, 3, start, start)).toMatchObject({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
  });

  it("refuses past the maximum and says when the window resets", () => {
    const now = new Date(start.getTime() + 12_500);
    const d = decide(policy, 4, start, now);
    expect(d.allowed).toBe(false);
    expect(d.remaining).toBe(0);
    // 47.5 s left → rounded up.
    expect(d.retryAfterSeconds).toBe(48);
  });

  it("never asks to wait less than a second", () => {
    const now = new Date(start.getTime() + 59_999);
    expect(decide(policy, 4, start, now).retryAfterSeconds).toBe(1);
    // A stale window that the store has not rolled yet still gives a sane answer.
    expect(decide(policy, 4, start, new Date(start.getTime() + 120_000)).retryAfterSeconds).toBe(1);
  });

  it("keys by scope and subject and words the refusal", () => {
    expect(rateLimitKey("model:user", "u1")).toBe("model:user:u1");
    expect(rateLimitMessage(12)).toBe("Slow down — try again in 12 s.");
  });

  it("keeps the polling routes far above what the UI actually sends", () => {
    // jobs poll every 1.5 s (40/min) + workspace refetches; 300/min leaves room.
    expect(RATE_LIMITS["api:session"].max).toBeGreaterThanOrEqual(200);
    expect(RATE_LIMITS["model:user"].max).toBeLessThan(RATE_LIMITS["api:session"].max);
  });
});
