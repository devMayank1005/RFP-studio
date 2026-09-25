import { and, inArray, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { finishJob } from "@/db/jobs";
import { finishKbSource } from "@/db/kb-ingest";
import { finishExportRow } from "@/db/queries/exports";
import { exports as exportsTable, generationJobs, kbSources, rfpDocuments, rfps } from "@/db/schema";
import { STALE_RUN_MS, classifyJobs, orphanBlobs, type BlobFile } from "@/domain/sweep";
import { StorageUnavailableError } from "@/domain/storage";
import { deletePrivate, listPrivate } from "@/lib/blob";
import { reportError, reportEvent } from "@/lib/report";

/**
 * The sweeper's two halves: `planSweep` reads and decides (the rules are pure,
 * in src/domain/sweep.ts), `runSweep` acts on a plan. The Inngest cron runs
 * both as separate steps; `pnpm sweep:preview` runs only the first.
 *
 * Deliberately free of "server-only" so the preview script can import it.
 */

export interface ReapPlan {
  id: string;
  jobType: string;
  reason: string;
  /** Owner-row ids the job carried: documentId (parse, quick), exportId (export). */
  payload: Record<string, unknown>;
}

export interface SweepPlan {
  reap: ReapPlan[];
  /** kb_sources still queued/running past the run window. */
  staleSources: string[];
  orphans: BlobFile[];
  /** How many files were listed, for the log line. */
  scanned: number;
}

/** Every file under a prefix, page by page. A suspended or unreachable store lists nothing (and is reported), so the rest of the sweep still runs. */
async function listAll(prefix: string): Promise<BlobFile[]> {
  const out: BlobFile[] = [];
  let cursor: string | undefined;
  try {
    do {
      const page = await listPrivate(prefix, cursor);
      for (const b of page.blobs) out.push({ pathname: b.pathname, url: b.url, uploadedAt: b.uploadedAt });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (err) {
    if (!(err instanceof StorageUnavailableError)) throw err;
    reportEvent("sweep.storage_unavailable", { prefix, reason: err.message });
    return [];
  }
  return out;
}

/**
 * Decides what the sweeper would do now without doing it: jobs to reap as failed,
 * sources to retire, orphaned blobs to delete, rate-limit rows to expire.
 * @sideEffects none — reads generation_jobs, kb_sources, Blob listings and rate_limits.
 */
export async function planSweep(now = new Date()): Promise<SweepPlan> {
  const live = await db
    .select({ id: generationJobs.id, jobType: generationJobs.jobType, status: generationJobs.status, createdAt: generationJobs.createdAt, startedAt: generationJobs.startedAt, payload: generationJobs.payload })
    .from(generationJobs)
    .where(inArray(generationJobs.status, ["queued", "running"]));
  const byId = new Map(live.map((j) => [j.id, j]));
  const reap = classifyJobs(live, now).map((d) => {
    const job = byId.get(d.id)!;
    return { id: d.id, jobType: job.jobType, reason: d.reason, payload: job.payload };
  });

  const staleSources = (
    await db
      .select({ id: kbSources.id })
      .from(kbSources)
      .where(and(inArray(kbSources.status, ["queued", "running"]), lt(kbSources.ingestedAt, new Date(now.getTime() - STALE_RUN_MS))))
  ).map((r) => r.id);

  const [rfpRows, docs, exportRows, sourceRows, pasteRows] = await Promise.all([
    db.select({ id: rfps.id }).from(rfps),
    db.select({ fileUrl: rfpDocuments.fileUrl, parsedTextUrl: rfpDocuments.parsedTextUrl }).from(rfpDocuments),
    db.select({ fileUrl: exportsTable.fileUrl }).from(exportsTable).where(isNotNull(exportsTable.fileUrl)),
    db.select({ fileUrl: kbSources.fileUrl }).from(kbSources).where(isNotNull(kbSources.fileUrl)),
    // Quick Q&A pastes live only in the intake job's payload.
    db.select({ url: sql<string | null>`${generationJobs.payload}->>'parsedTextUrl'` }).from(generationJobs),
  ]);
  const referencedUrls = new Set<string>();
  for (const d of docs) {
    referencedUrls.add(d.fileUrl);
    if (d.parsedTextUrl) referencedUrls.add(d.parsedTextUrl);
  }
  for (const r of exportRows) if (r.fileUrl) referencedUrls.add(r.fileUrl);
  for (const r of sourceRows) if (r.fileUrl) referencedUrls.add(r.fileUrl);
  for (const r of pasteRows) if (r.url) referencedUrls.add(r.url);

  const files = [...(await listAll("rfps/")), ...(await listAll("kb/"))];
  const orphans = orphanBlobs({ files, rfpIds: new Set(rfpRows.map((r) => r.id)), referencedUrls, now });

  return { reap, staleSources, orphans, scanned: files.length };
}

/** Files deleted per run at most, so one huge backlog cannot pin a step. */
export const MAX_DELETES_PER_RUN = 200;

export interface SweepResult {
  reaped: number;
  sources: number;
  deleted: number;
  rateRows: number;
}

/**
 * Applies a sweep plan and returns the counts.
 * @sideEffects Marks generation_jobs failed, updates kb_sources, deletes Blob objects, deletes rate_limits rows.
 */
export async function runSweep(plan: SweepPlan, now = new Date()): Promise<SweepResult> {
  for (const job of plan.reap) {
    await finishJob(job.id, "failed", job.reason);
    reportError(new Error(job.reason), { where: "sweep", jobId: job.id, jobType: job.jobType });
    const documentId = typeof job.payload.documentId === "string" ? job.payload.documentId : null;
    const exportId = typeof job.payload.exportId === "string" ? job.payload.exportId : null;
    if ((job.jobType === "parse" || job.jobType === "quick") && documentId) {
      await db.update(rfpDocuments).set({ parseStatus: "failed", parseError: job.reason }).where(sql`${rfpDocuments.id} = ${documentId} and ${rfpDocuments.parseStatus} in ('pending', 'parsing')`);
    }
    if (job.jobType === "export" && exportId) await finishExportRow(exportId, { status: "failed", error: job.reason });
  }
  for (const id of plan.staleSources) await finishKbSource(id, "failed", { error: "Ran too long and was retired by the sweeper." });

  const toDelete = plan.orphans.slice(0, MAX_DELETES_PER_RUN);
  for (let i = 0; i < toDelete.length; i += 50) await deletePrivate(toDelete.slice(i, i + 50).map((f) => f.url));

  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const ours = await db.execute(sql`delete from rate_limits where window_start < ${hourAgo}`);
  const auth = await db.execute(sql`delete from rate_limit where last_request < ${hourAgo.getTime()}`);

  return { reaped: plan.reap.length, sources: plan.staleSources.length, deleted: toDelete.length, rateRows: (ours.rowCount ?? 0) + (auth.rowCount ?? 0) };
}
