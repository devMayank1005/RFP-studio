import { reportEvent } from "@/lib/report";
import { planSweep, runSweep } from "@/lib/sweep";

import { inngest } from "./client";

/**
 * Every 10 minutes: retire jobs nobody picked up or that ran too long (and
 * the export, document or KB-source row that was waiting on them), delete
 * stored files whose rows are gone, and drop old rate-limit rows. Rules in
 * src/domain/sweep.ts; the log line is what to look for in Vercel → Logs
 * (`event:sweep`).
 *
 * An Inngest cron rather than a Vercel one: the Hobby plan runs Vercel crons
 * once a day at most.
 */
export const sweep = inngest.createFunction(
  {
    id: "sweep",
    name: "Sweep stale jobs and orphaned files",
    retries: 1,
    concurrency: [{ limit: 1 }],
    triggers: [{ cron: "*/10 * * * *" }],
  },
  async ({ step }) => {
    const plan = await step.run("plan", () => planSweep());
    const result = await step.run("run", () => runSweep(plan));
    reportEvent("sweep", { ...result, scanned: plan.scanned });
    return result;
  },
);
