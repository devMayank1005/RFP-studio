/**
 * What the next sweep would do, without doing it: jobs to retire, KB sources
 * to fail, stored files to delete. Run it before the first real sweep on a
 * database, and whenever storage looks off.
 *
 *   pnpm sweep:preview
 */
import "@/lib/load-env";

import { planSweep } from "@/lib/sweep";

async function main() {
  const plan = await planSweep();
  console.log(`[sweep] ${plan.scanned} file(s) listed · ${plan.reap.length} job(s) to retire · ${plan.staleSources.length} KB source(s) to fail · ${plan.orphans.length} file(s) to delete`);
  for (const j of plan.reap) console.log(`[sweep]   job ${j.id} (${j.jobType}): ${j.reason}`);
  for (const s of plan.staleSources) console.log(`[sweep]   kb source ${s}: ran too long`);
  for (const f of plan.orphans) console.log(`[sweep]   delete ${f.pathname} (uploaded ${new Date(f.uploadedAt).toISOString()})`);
  if (!plan.reap.length && !plan.staleSources.length && !plan.orphans.length) console.log("[sweep] nothing to do");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[sweep] FAILED", err instanceof Error ? err.message : err);
    process.exit(1);
  });
