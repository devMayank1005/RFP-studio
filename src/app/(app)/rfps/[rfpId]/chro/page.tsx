import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ChroBoard } from "@/components/chro/chro-board";
import { latestJob } from "@/db/jobs";
import { listChroQuestions } from "@/db/queries/chro";
import { getRfpHeader } from "@/db/queries/rfps";
import { chroReadiness, isStaleQueuedJob } from "@/domain/chro";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "CHRO questions" };

/** The discovery agenda for the CHRO conversation: proposed by Opus from the approved answers, curated by the team. */
export default async function ChroPage({ params }: PageProps<"/rfps/[rfpId]/chro">) {
  const [session, { rfpId }] = await Promise.all([requireSession(), params]);
  const [rfp, rows, job] = await Promise.all([getRfpHeader(session.workspaceId, rfpId), listChroQuestions(session.workspaceId, rfpId), latestJob(rfpId, "chro")]);
  if (!rfp || !rows) notFound();

  const stale = isStaleQueuedJob(job);
  const active = job && !stale && (job.status === "queued" || job.status === "running") ? job.id : null;
  return (
    <ChroBoard
      key={rows.map((r) => r.id).join("|")}
      rfpId={rfp.id}
      rows={rows}
      readiness={chroReadiness({ approved: rfp.approvedCount, total: rfp.questionCount })}
      role={session.role}
      activeJobId={active}
      lastJobError={job?.status === "failed" ? job.error : stale ? "The last request was never picked up by a worker. Generate again." : null}
    />
  );
}
