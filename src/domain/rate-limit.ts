/**
 * Rate-limit policy and decision, pure. The store (a Postgres fixed-window
 * counter) lives in src/lib/rate-limit.ts; this decides what a count means.
 */

export type RateLimitScope = "model:user" | "jobs:user" | "api:session";

export interface RateLimitPolicy {
  windowMs: number;
  /** Calls allowed per window, inclusive. */
  max: number;
}

/**
 * Per subject per minute. Model calls made synchronously inside a request are
 * the expensive ones; job enqueues fan out to more model calls but are bounded
 * by the per-workspace concurrency; the API routes are polled (jobs every
 * 1.5 s, the grid on every mutation), so their limit only stops a runaway tab.
 */
export const RATE_LIMITS: Record<RateLimitScope, RateLimitPolicy> = {
  "model:user": { windowMs: 60_000, max: 30 },
  "jobs:user": { windowMs: 60_000, max: 20 },
  "api:session": { windowMs: 60_000, max: 300 },
};

export function rateLimitKey(scope: RateLimitScope, subject: string): string {
  return `${scope}:${subject}`;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  /** Whole seconds until the window resets; 0 when allowed. */
  retryAfterSeconds: number;
}

/** `count` is the number of calls in the current window, this one included. */
export function decide(policy: RateLimitPolicy, count: number, windowStart: Date, now: Date): RateLimitDecision {
  const allowed = count <= policy.max;
  const resetAt = windowStart.getTime() + policy.windowMs;
  return {
    allowed,
    remaining: Math.max(0, policy.max - count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)),
  };
}

export function rateLimitMessage(retryAfterSeconds: number): string {
  return `Slow down — try again in ${retryAfterSeconds} s.`;
}
