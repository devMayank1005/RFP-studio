/**
 * Recomputes the dashboard counters (maintained by triggers, migration 0006)
 * and compares them with what is stored on each RFP. Read-only; exits 1 on
 * drift so it can gate a deploy.
 *
 *   pnpm db:counts-check
 */
import "@/lib/load-env";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";

interface Row {
  id: string;
  title: string;
  question_count: number;
  drafted_count: number;
  approved_count: number;
  flagged_count: number;
  live_q: number;
  live_d: number;
  live_a: number;
  live_f: number;
}

async function main() {
  const { rows } = await db.execute(sql`
    select r.id, r.title, r.question_count, r.drafted_count, r.approved_count, r.flagged_count,
           s.q as live_q, s.d as live_d, s.a as live_a, s.f as live_f
      from rfps r
      cross join lateral (
        select count(q.id)::int as q, count(s.id)::int as d,
               count(*) filter (where s.status = 'approved')::int as a,
               count(*) filter (where s.status = 'flagged')::int as f
          from rfp_questions q left join responses s on s.question_id = q.id
         where q.rfp_id = r.id
      ) s
  `);
  const drift = (rows as unknown as Row[]).filter((r) => r.question_count !== r.live_q || r.drafted_count !== r.live_d || r.approved_count !== r.live_a || r.flagged_count !== r.live_f);
  console.log(`[counts] ${rows.length} RFP(s) checked · ${drift.length} drifted`);
  for (const r of drift) {
    console.log(`[counts]   ${r.title.slice(0, 40)} — stored ${r.question_count}/${r.drafted_count}/${r.approved_count}/${r.flagged_count} vs live ${r.live_q}/${r.live_d}/${r.live_a}/${r.live_f}`);
  }
  if (drift.length) throw new Error("counters drifted — run `select rfp_counts_refresh(id) from rfps` and look for writes that bypass the triggers");
  console.log("[counts] ok — every counter matches a live recount");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[counts] FAILED", err instanceof Error ? err.message : err);
    process.exit(1);
  });
