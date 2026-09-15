"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { startExtraction } from "@/app/actions/documents";
import { JobProgress } from "@/components/wizard/job-progress";

/** The extraction job while it runs (or after it failed), with a retry. */
export function ExtractionStatus({ rfpId, jobId }: { rfpId: string; jobId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <JobProgress
      jobId={jobId}
      detail="Claude reads each chunk of the RFP, classifies every row, groups them into sections and writes the context brief. A few minutes for a large spreadsheet."
      onDone={() => router.refresh()}
      onRetry={() =>
        startTransition(async () => {
          const result = await startExtraction(rfpId);
          if (!result.ok) toast.error(result.error);
          else router.refresh();
        })
      }
    />
  );
}
