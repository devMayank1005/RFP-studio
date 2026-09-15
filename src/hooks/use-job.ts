"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import type { JobView } from "@/db/jobs";

export type JobSnapshot = Omit<JobView, "createdAt" | "startedAt" | "finishedAt"> & {
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

const TERMINAL = new Set(["done", "failed", "cancelled"]);

export function isJobActive(job: { status: string } | null | undefined): boolean {
  return !!job && !TERMINAL.has(job.status);
}

/**
 * Polls /api/jobs/[id] every 1.5 s while the job is queued or running, then
 * stops. When it reaches a terminal state, `onSettled` fires once — pages
 * use that to `router.refresh()` so server-rendered lists catch up.
 */
export function useJob(jobId: string | null | undefined, opts: { onSettled?: (job: JobSnapshot) => void; refreshOnSettle?: boolean } = {}) {
  const router = useRouter();
  const settledFor = useRef<string | null>(null);

  const query = useQuery<JobSnapshot>({
    queryKey: ["job", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`job ${jobId}: ${res.status}`);
      return res.json();
    },
    refetchInterval: (q) => (isJobActive(q.state.data) || !q.state.data ? 1500 : false),
    // A reviewer who tabs away during a 300-question draft still expects the grid to be ready on return.
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const job = query.data ?? null;
  useEffect(() => {
    if (!job || isJobActive(job) || settledFor.current === job.id) return;
    settledFor.current = job.id;
    opts.onSettled?.(job);
    if (opts.refreshOnSettle !== false) router.refresh();
    // opts is intentionally not a dependency: callbacks are read once, on settle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, router]);

  return { job, isActive: isJobActive(job), isLoading: query.isLoading, error: query.error };
}
