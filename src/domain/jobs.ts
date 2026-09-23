/**
 * Background jobs run through Inngest. Locally the dev server needs no key;
 * in production the client runs in cloud mode and a missing event key means
 * nothing is ever sent. These pure rules let the app say so before it writes
 * a row, and recognise a job nobody picked up.
 */

/** A queued job (or pending document) older than this was never picked up: the Inngest app was not registered or had no key. */
export const STALE_QUEUE_MS = 5 * 60 * 1000;

/** True when a queued job (or pending document) has waited longer than STALE_QUEUE_MS: nothing will pick it up now, so the UI can offer a retry. */
export function isStaleQueuedJob(job: { status: string; createdAt: Date | string } | null | undefined, now = new Date()): boolean {
  return !!job && (job.status === "queued" || job.status === "pending") && now.getTime() - new Date(job.createdAt).getTime() > STALE_QUEUE_MS;
}

/** The warning to show when background jobs cannot run (cloud mode without an event key); null when the runner is configured. */
export function jobRunnerConfigMessage(input: { cloudMode: boolean; hasEventKey: boolean }): string | null {
  if (!input.cloudMode || input.hasEventKey) return null;
  return "Background jobs are not configured on this server: INNGEST_EVENT_KEY is missing, so uploads, extraction, drafting and CHRO generation cannot run. See README › Deploying.";
}

/**
 * The "n / total" a progress card shows. Clamped: a durable step that was
 * retried after its progress write had already landed must never read as
 * more work done than exists ("33 / 20" happened). Empty until the total is
 * known — a queued job has nothing honest to count yet.
 */
export function progressLabel(done: number, total: number): string {
  if (total <= 0) return "";
  return `${Math.min(done, total)} / ${total}`;
}
