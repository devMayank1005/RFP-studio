import "server-only";

import { finishJob } from "@/db/jobs";
import { inngest, jobsConfigError } from "@/inngest/client";
import { ActionError } from "@/lib/actions";
import { redactSecrets } from "@/lib/redact";
import { reportError } from "@/lib/report";

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

/**
 * A job that failed for good: the row says why (redacted, capped — the reason
 * is shown in the UI and must never carry a credential) and the error is
 * reported. Returns the stored reason so owner rows can say the same thing.
 */
export async function failJob(jobId: string, error: unknown, ctx: { where: string; [extra: string]: unknown }): Promise<string> {
  const message = (redactSecrets(error instanceof Error ? error.message : String(error)) ?? "Unknown error").slice(0, 500);
  await finishJob(jobId, "failed", message);
  reportError(error, { ...ctx, jobId });
  return message;
}
