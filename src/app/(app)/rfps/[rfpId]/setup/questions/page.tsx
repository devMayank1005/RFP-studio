import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { ExtractedQuestionsTable } from "@/components/wizard/extracted-questions-table";
import { ExtractionStatus } from "@/components/wizard/extraction-status";
import { latestJob } from "@/db/jobs";
import { listQuestionsForSetup } from "@/db/queries/questions";
import { getRfpHeader } from "@/db/queries/rfps";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Questions" };

/** Wizard step 3: what Claude extracted, before a human confirms it. */
export default async function QuestionsPage({ params }: PageProps<"/rfps/[rfpId]/setup/questions">) {
  const [session, { rfpId }] = await Promise.all([requireSession(), params]);
  const [rfp, job, setup] = await Promise.all([
    getRfpHeader(session.workspaceId, rfpId),
    latestJob(rfpId, "extract"),
    listQuestionsForSetup(session.workspaceId, rfpId),
  ]);
  if (!rfp || !setup) notFound();

  const active = job && (job.status === "queued" || job.status === "running");
  const failed = job?.status === "failed";

  if (active || (failed && setup.questions.length === 0)) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <ExtractionStatus rfpId={rfpId} jobId={job!.id} />
      </div>
    );
  }

  if (!setup.questions.length) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No questions yet"
        description="Upload the RFP and run extraction first."
        action={
          <Button asChild variant="outline">
            <Link href={`/rfps/${rfpId}/setup/upload`}>Back to upload</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ExtractedQuestionsTable
      key={setup.questions.map((q) => q.id).join(",").length + ":" + setup.questions.length}
      rfpId={rfpId}
      questions={setup.questions}
      sections={setup.sections}
    />
  );
}
