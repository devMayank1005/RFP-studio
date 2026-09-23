
import { and, desc, eq, sql } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { isUuid } from "@/domain/ids";
import { generationJobs, rfps } from "@/db/schema";
import type { JobStatus, JobType } from "@/domain/enums";

/**
 * generation_jobs is the progress the UI polls. Steps write to it as they
 * go; the row is the single source of truth for "how far along is this".
 */

/**
 * Insert a job. `dedupeKey` names the work ("draft:all", "export:xlsx", "parse:<docId>"…):
 * the partial unique index on (rfp_id, dedupe_key) for queued/running rows makes a
 * second live job with the same key a no-op, returned here as null. Callers retire
 * stale queued jobs first (isStaleQueuedJob) so a lost worker never blocks forever.
 */
export async function createJob(input: {
  rfpId: string;
  jobType: JobType;
  dedupeKey: string;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
  progressTotal?: number;
}): Promise<string | null> {
  const [row] = await db
    .insert(generationJobs)
    .values({
      rfpId: input.rfpId,
      jobType: input.jobType,
      dedupeKey: input.dedupeKey,
      payload: input.payload ?? {},
      createdBy: input.createdBy ?? null,
      progressTotal: input.progressTotal ?? 0,
    })
    .onConflictDoNothing({ target: [generationJobs.rfpId, generationJobs.dedupeKey], where: sql`${generationJobs.status} in ('queued', 'running')` })
    .returning({ id: generationJobs.id });
  return row?.id ?? null;
}

/**
 * Flip a job to `running` and stamp `startedAt`; the Inngest run id is kept when the worker passes it.
 * @sideEffects Updates `generation_jobs`; sends no events.
 */
export async function markJobRunning(jobId: string, runId?: string) {
  await db
    .update(generationJobs)
    .set({ status: "running", startedAt: new Date(), ...(runId ? { inngestRunId: runId } : {}) })
    .where(eq(generationJobs.id, jobId));
}

/**
 * Set the job's progress outright — and the total, when a step only learns it late.
 * @sideEffects Updates `generation_jobs`; sends no events.
 */
export async function setJobProgress(jobId: string, done: number, total?: number) {
  await db
    .update(generationJobs)
    .set({ progressDone: done, ...(total !== undefined ? { progressTotal: total } : {}) })
    .where(eq(generationJobs.id, jobId));
}

/**
 * Increment the job's progress in SQL, so parallel steps never lose a count to a stale read.
 * @sideEffects Updates `generation_jobs`; sends no events.
 */
export async function bumpJobProgress(jobId: string, by = 1) {
  await db
    .update(generationJobs)
    .set({ progressDone: sql`${generationJobs.progressDone} + ${by}` })
    .where(eq(generationJobs.id, jobId));
}

/**
 * Close a job as done, failed or cancelled and stamp `finishedAt`; `error` is what the UI shows.
 * @sideEffects Updates `generation_jobs`; sends no events.
 */
export async function finishJob(jobId: string, status: Extract<JobStatus, "done" | "failed" | "cancelled">, error?: string) {
  await db
    .update(generationJobs)
    .set({ status, finishedAt: new Date(), error: error ?? null })
    .where(eq(generationJobs.id, jobId));
}

export interface JobView {
  id: string;
  rfpId: string;
  jobType: JobType;
  status: JobStatus;
  progressDone: number;
  progressTotal: number;
  error: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

/** A job, only if its RFP belongs to the workspace. */
export async function getJob(workspaceId: string, jobId: string, executor: Executor = db): Promise<JobView | null> {
  if (!isUuid(jobId)) return null;
  const [row] = await executor
    .select({
      id: generationJobs.id,
      rfpId: generationJobs.rfpId,
      jobType: generationJobs.jobType,
      status: generationJobs.status,
      progressDone: generationJobs.progressDone,
      progressTotal: generationJobs.progressTotal,
      error: generationJobs.error,
      payload: generationJobs.payload,
      createdAt: generationJobs.createdAt,
      startedAt: generationJobs.startedAt,
      finishedAt: generationJobs.finishedAt,
    })
    .from(generationJobs)
    .innerJoin(rfps, eq(generationJobs.rfpId, rfps.id))
    .where(and(eq(generationJobs.id, jobId), eq(rfps.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

/** The most recent job of a type for an RFP — what the setup screens show. */
/** The newest job of a type on an RFP; `opts.dedupeKey` narrows it (e.g. "draft:all", so single-question drafts do not count). */
export async function latestJob(rfpId: string, jobType: JobType, opts: { dedupeKey?: string } = {}): Promise<JobView | null> {
  if (!isUuid(rfpId)) return null;
  const [row] = await db
    .select({
      id: generationJobs.id,
      rfpId: generationJobs.rfpId,
      jobType: generationJobs.jobType,
      status: generationJobs.status,
      progressDone: generationJobs.progressDone,
      progressTotal: generationJobs.progressTotal,
      error: generationJobs.error,
      payload: generationJobs.payload,
      createdAt: generationJobs.createdAt,
      startedAt: generationJobs.startedAt,
      finishedAt: generationJobs.finishedAt,
    })
    .from(generationJobs)
    .where(and(eq(generationJobs.rfpId, rfpId), eq(generationJobs.jobType, jobType), ...(opts.dedupeKey ? [eq(generationJobs.dedupeKey, opts.dedupeKey)] : [])))
    .orderBy(desc(generationJobs.createdAt))
    .limit(1);
  return row ?? null;
}
