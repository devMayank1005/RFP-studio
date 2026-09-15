import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Workspace } from "@/components/workspace/workspace";
import { getWorkspaceRows } from "@/db/queries/workspace";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Workspace" };

/** The main screen. Rows are fetched here once and handed to TanStack Query as initial data. */
export default async function WorkspacePage({ params }: PageProps<"/rfps/[rfpId]/workspace">) {
  const [session, { rfpId }] = await Promise.all([requireSession(), params]);
  const data = await getWorkspaceRows(session.workspaceId, rfpId);
  if (!data) notFound();

  return <Workspace rfpId={rfpId} initial={data} role={session.role} />;
}
