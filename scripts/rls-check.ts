/**
 * Proves the row-level security policies bite: inside `withOrg(<other org>)`
 * a workspace's RFPs must be invisible, and inside `withOrg(<own org>)` all of
 * them must be there. Read-only.
 *
 *   pnpm db:rls-check
 */
import "@/lib/load-env";

import { eq, sql } from "drizzle-orm";

import { db, withOrg } from "@/db/client";
import { rfpQuestions, rfps } from "@/db/schema";

async function main() {
  const [sample] = await db.select({ workspaceId: rfps.workspaceId }).from(rfps).limit(1);
  if (!sample) {
    console.log("[rls] no RFPs to test with — seed first");
    return;
  }
  const ws = sample.workspaceId;
  const plain = await db.select({ id: rfps.id }).from(rfps).where(eq(rfps.workspaceId, ws));
  const own = await withOrg(ws, (tx) => tx.select({ id: rfps.id }).from(rfps).where(eq(rfps.workspaceId, ws)));
  const other = await withOrg("rls-check-no-such-org", (tx) => tx.select({ id: rfps.id }).from(rfps).where(eq(rfps.workspaceId, ws)));
  const otherQuestions = await withOrg("rls-check-no-such-org", (tx) => tx.select({ id: rfpQuestions.id }).from(rfpQuestions).where(eq(rfpQuestions.workspaceId, ws)));

  console.log(`[rls] rfps — plain ${plain.length} · own org ${own.length} · other org ${other.length} · other org questions ${otherQuestions.length}`);
  if (other.length !== 0 || otherQuestions.length !== 0) {
    // Say why before failing: the usual culprits are a role that bypasses RLS or a GUC that never reached the connection.
    const diag = await withOrg("rls-check-no-such-org", (tx) =>
      tx.execute(sql`select current_user as role,
                            (select rolsuper from pg_roles where rolname = current_user) as superuser,
                            (select rolbypassrls from pg_roles where rolname = current_user) as bypassrls,
                            current_setting('app.org_id', true) as org_setting,
                            (select relrowsecurity::text || '/' || relforcerowsecurity::text from pg_class where relname = 'rfps') as rfps_rls_enabled_forced,
                            (select count(*) from pg_policies where tablename = 'rfps') as rfps_policies`),
    );
    console.log("[rls] diagnostics", JSON.stringify(diag.rows[0]));
    throw new Error("cross-tenant read returned rows — a policy is missing or wrong");
  }
  if (own.length !== plain.length) throw new Error("own-tenant read lost rows — the policy is too strict");
  console.log("[rls] ok — cross-tenant read returned 0 rows");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[rls] FAILED", err instanceof Error ? err.message : err);
    process.exit(1);
  });
