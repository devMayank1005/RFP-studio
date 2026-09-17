import "server-only";

import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db/client";
import { RATE_LIMITS, decide, rateLimitKey, rateLimitMessage, type RateLimitDecision, type RateLimitScope } from "@/domain/rate-limit";
import { ActionError } from "@/lib/actions";
import type { AppSession } from "@/lib/session";

/**
 * A fixed-window counter in Postgres (`rate_limits`, migration 0008): one
 * upsert per limited call, no extra infrastructure, and correct across every
 * Fluid-compute instance — which an in-memory counter would not be. The
 * sweeper deletes rows older than an hour.
 */
export async function takeBudget(scope: RateLimitScope, subject: string, now = new Date()): Promise<RateLimitDecision> {
  const policy = RATE_LIMITS[scope];
  const key = rateLimitKey(scope, subject);
  const windowFloor = new Date(now.getTime() - policy.windowMs);
  const { rows } = await db.execute(sql`
    insert into rate_limits (key, window_start, count) values (${key}, ${now}, 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start <= ${windowFloor} then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start <= ${windowFloor} then ${now} else rate_limits.window_start end
    returning count, window_start
  `);
  const row = rows[0] as { count: number | string; window_start: string | Date };
  return decide(policy, Number(row.count), new Date(row.window_start), now);
}

/** For server actions: throws the friendly refusal when the budget is spent. */
export async function requireBudget(session: AppSession, scope: RateLimitScope): Promise<void> {
  const d = await takeBudget(scope, session.userId);
  if (!d.allowed) throw new ActionError(rateLimitMessage(d.retryAfterSeconds));
}

/** For route handlers: a 429 with Retry-After when the budget is spent, otherwise null. */
export async function apiBudget(session: AppSession, scope: RateLimitScope): Promise<NextResponse | null> {
  const d = await takeBudget(scope, session.userId);
  if (d.allowed) return null;
  return NextResponse.json({ error: rateLimitMessage(d.retryAfterSeconds) }, { status: 429, headers: { "retry-after": String(d.retryAfterSeconds), "cache-control": "no-store" } });
}
