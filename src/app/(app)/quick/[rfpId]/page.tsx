import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { QuickSessionView } from "@/components/quick/quick-session-view";
import { latestJob } from "@/db/jobs";
import { getQuickSession, listQuickRows } from "@/db/queries/quick";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Quick Q&A" };

/** One session: progress while it drafts, then every question with its answer and the actions on it. */
export default async function QuickSessionPage({ params }: PageProps<"/quick/[rfpId]">) {
  const [session, { rfpId }] = await Promise.all([requireSession(), params]);
  const quick = await getQuickSession(session.workspaceId, rfpId);
  if (!quick) notFound();
  const [rows, intake, draft] = await Promise.all([listQuickRows(session.workspaceId, quick.id), latestJob(quick.id, "quick"), latestJob(quick.id, "draft")]);

  return <QuickSessionView session={quick} rows={rows ?? []} intake={intake} draft={draft} role={session.role} now={new Date()} />;
}
