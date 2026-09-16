import "server-only";

import { finishJob } from "@/db/jobs";
import { inngest, jobsConfigError } from "@/inngest/client";
import { ActionError } from "@/lib/actions";

/** Refuse before writing anything when the job runner cannot receive events. */
export function requireJobRunner(): void {
  const error = jobsConfigError();
  if (error) throw new ActionError(error);
}

type SendPayload = Parameters<typeof inngest.send>[0];

/**
 * Send an event, and if that fails leave no ghost behind: the job is marked
 * failed with the reason, the caller's hook marks its own row, and the user
 * gets the reason instead of a row that says "Queued" forever.
 */
export async function sendJobEvent(payload: SendPayload, opts: { jobId?: string; onFailure?: (reason: string) => Promise<void> } = {}): Promise<void> {
  try {
    await inngest.send(payload);
  } catch (err) {
    const reason = (err instanceof Error ? err.message : String(err)).split("\n")[0].slice(0, 300);
    if (opts.jobId) await finishJob(opts.jobId, "failed", `Not queued: ${reason}`);
    await opts.onFailure?.(reason);
    throw new ActionError(`The background job could not be queued: ${reason}`);
  }
}
