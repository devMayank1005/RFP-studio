
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { generationJobs, rfps } from "@/db/schema";
import type { JobStatus, JobType } from "@/domain/enums";

/**
 * generation_jobs is the progress the UI polls. Steps write to it as they
 * go; the row is the single source of truth for "how far along is this".
 */

export async function createJob(input: {
  rfpId: string;
  jobType: JobType;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
  progressTotal?: number;
}): Promise<string> {
  const [row] = await db
    .insert(generationJobs)
    .values({
      rfpId: input.rfpId,
      jobType: input.jobType,
      payload: input.payload ?? {},
      createdBy: input.createdBy ?? null,
      progressTotal: input.progressTotal ?? 0,
    })
    .returning({ id: generationJobs.id });
  return row.id;
}

export async function markJobRunning(jobId: string, runId?: string) {
  await db
    .update(generationJobs)
    .set({ status: "running", startedAt: new Date(), ...(runId ? { inngestRunId: runId } : {}) })
    .where(eq(generationJobs.id, jobId));
}

export async function setJobProgress(jobId: string, done: number, total?: number) {
  await db
    .update(generationJobs)
    .set({ progressDone: done, ...(total !== undefined ? { progressTotal: total } : {}) })
    .where(eq(generationJobs.id, jobId));
}

export async function bumpJobProgress(jobId: string, by = 1) {
  await db
    .update(generationJobs)
    .set({ progressDone: sql`${generationJobs.progressDone} + ${by}` })
    .where(eq(generationJobs.id, jobId));
}

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
export async function getJob(workspaceId: string, jobId: string): Promise<JobView | null> {
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
    .innerJoin(rfps, eq(generationJobs.rfpId, rfps.id))
    .where(and(eq(generationJobs.id, jobId), eq(rfps.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

/** The most recent job of a type for an RFP — what the setup screens show. */
export async function latestJob(rfpId: string, jobType: JobType): Promise<JobView | null> {
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
    .where(and(eq(generationJobs.rfpId, rfpId), eq(generationJobs.jobType, jobType)))
    .orderBy(desc(generationJobs.createdAt))
    .limit(1);
  return row ?? null;
}
