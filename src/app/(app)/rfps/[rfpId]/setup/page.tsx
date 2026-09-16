import { notFound, redirect } from "next/navigation";

import { latestJob } from "@/db/jobs";
import { getRfpHeader } from "@/db/queries/rfps";
import { setupStepFor, setupStepPath } from "@/domain/routes";
import { requireSession } from "@/lib/session";

/**
 * The Setup tab and intake links land here; there is nothing to show at
 * /setup itself, so resume at the first step that still has work.
 */
export default async function SetupIndexPage({ params }: PageProps<"/rfps/[rfpId]/setup">) {
  const [session, { rfpId }] = await Promise.all([requireSession(), params]);
  const [rfp, extraction] = await Promise.all([getRfpHeader(session.workspaceId, rfpId), latestJob(rfpId, "extract")]);
  if (!rfp) notFound();
  redirect(setupStepPath(rfpId, setupStepFor({ status: rfp.status, questionCount: rfp.questionCount, hasExtractionJob: extraction !== null })));
}
