import { notFound } from "next/navigation";

import { RfpHeader } from "@/components/rfp/rfp-header";
import { getRfpHeader } from "@/db/queries/rfps";
import { todayInKolkata } from "@/domain/dates";
import { requireSession } from "@/lib/session";

export default async function RfpLayout({ children, params }: LayoutProps<"/rfps/[rfpId]">) {
  const [session, { rfpId }] = await Promise.all([requireSession(), params]);
  const rfp = await getRfpHeader(session.workspaceId, rfpId);
  if (!rfp) notFound();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RfpHeader rfp={rfp} today={todayInKolkata()} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
