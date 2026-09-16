/**
 * Background jobs run through Inngest. Locally the dev server needs no key;
 * in production the client runs in cloud mode and a missing event key means
 * nothing is ever sent. These pure rules let the app say so before it writes
 * a row, and recognise a job nobody picked up.
 */

/** A queued job (or pending document) older than this was never picked up: the Inngest app was not registered or had no key. */
export const STALE_QUEUE_MS = 5 * 60 * 1000;

export function isStaleQueuedJob(job: { status: string; createdAt: Date | string } | null | undefined, now = new Date()): boolean {
  return !!job && (job.status === "queued" || job.status === "pending") && now.getTime() - new Date(job.createdAt).getTime() > STALE_QUEUE_MS;
}

export function jobRunnerConfigMessage(input: { cloudMode: boolean; hasEventKey: boolean }): string | null {
  if (!input.cloudMode || input.hasEventKey) return null;
  return "Background jobs are not configured on this server: INNGEST_EVENT_KEY is missing, so uploads, extraction, drafting and CHRO generation cannot run. See README › Deploying.";
}
