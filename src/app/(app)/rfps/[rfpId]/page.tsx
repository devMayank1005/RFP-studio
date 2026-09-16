import { notFound, redirect } from "next/navigation";

import { getRfpHeader } from "@/db/queries/rfps";
import { rfpLandingPath } from "@/domain/routes";
import { requireSession } from "@/lib/session";

/** /rfps/[id] lands where the work is: the wizard while questions are unconfirmed, the workspace after. */
export default async function RfpIndexPage({ params }: PageProps<"/rfps/[rfpId]">) {
  const [session, { rfpId }] = await Promise.all([requireSession(), params]);
  const rfp = await getRfpHeader(session.workspaceId, rfpId);
  if (!rfp) notFound();
  redirect(rfpLandingPath(rfp.id, rfp.status));
}
