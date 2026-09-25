import { STALE_QUEUE_MS } from "./jobs";

/**
 * What the sweeper does, decided without I/O: which live jobs are dead, and
 * which stored files nobody references any more. The Inngest cron in
 * src/inngest/sweep.ts and `pnpm sweep:preview` both run these rules.
 */

/** A running job older than this never finished: the function crashed past its retries, or the run was lost. */
export const STALE_RUN_MS = 30 * 60 * 1000;

/** A file of a live RFP or workspace is only an orphan once it is older than this, so an upload in progress is never touched. */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export interface SweepJobRow {
  id: string;
  status: string;
  createdAt: Date | string;
  startedAt: Date | string | null;
}

export interface ReapDecision {
  id: string;
  reason: string;
}

export const REAP_REASONS = {
  neverPickedUp: "Never picked up by the job runner — check that the Inngest app is registered and has its keys.",
  ranTooLong: "Ran too long and was retired by the sweeper.",
} as const;

/** Live jobs that are dead: queued past the pickup window, or running past the run window. */
export function classifyJobs(rows: SweepJobRow[], now: Date): ReapDecision[] {
  const t = now.getTime();
  const out: ReapDecision[] = [];
  for (const row of rows) {
    if (row.status === "queued" && t - new Date(row.createdAt).getTime() > STALE_QUEUE_MS) {
      out.push({ id: row.id, reason: REAP_REASONS.neverPickedUp });
    } else if (row.status === "running") {
      const since = row.startedAt ?? row.createdAt;
      if (t - new Date(since).getTime() > STALE_RUN_MS) out.push({ id: row.id, reason: REAP_REASONS.ranTooLong });
    }
  }
  return out;
}

/** One stored object as the sweeper sees it. `url` is the handle rows hold: an object key, or a Vercel Blob URL for files from before September 2026. */
export interface BlobFile {
  pathname: string;
  url: string;
  uploadedAt: Date | string;
}

export interface OrphanInput {
  files: BlobFile[];
  /** Every RFP id that exists. */
  rfpIds: ReadonlySet<string>;
  /** Every URL a row still points at: document files and parsed text, exports, KB sources, job payloads. */
  referencedUrls: ReadonlySet<string>;
  now: Date;
}

const RFP_PATH = /^rfps\/([^/]+)\//;
const KB_PATH = /^kb\/[^/]+\/sources\//;

/**
 * Files to delete. Anything under an RFP that no longer exists goes at once;
 * an unreferenced file under a live RFP or a workspace's KB sources goes only
 * after the grace period. Anything else (unknown prefixes) is left alone.
 */
export function orphanBlobs(input: OrphanInput): BlobFile[] {
  const t = input.now.getTime();
  const aged = (f: BlobFile) => t - new Date(f.uploadedAt).getTime() > ORPHAN_GRACE_MS;
  const out: BlobFile[] = [];
  for (const f of input.files) {
    const rfp = RFP_PATH.exec(f.pathname);
    if (rfp) {
      if (!input.rfpIds.has(rfp[1])) out.push(f);
      else if (!input.referencedUrls.has(f.url) && aged(f)) out.push(f);
      continue;
    }
    if (KB_PATH.test(f.pathname) && !input.referencedUrls.has(f.url) && aged(f)) out.push(f);
  }
  return out;
}
