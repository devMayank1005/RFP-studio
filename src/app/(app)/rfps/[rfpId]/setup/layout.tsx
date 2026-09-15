import { notFound } from "next/navigation";

import { Stepper } from "@/components/wizard/stepper";
import { getRfpHeader } from "@/db/queries/rfps";
import { requireSession } from "@/lib/session";

export default async function SetupLayout({ children, params }: LayoutProps<"/rfps/[rfpId]/setup">) {
  const [session, { rfpId }] = await Promise.all([requireSession(), params]);
  const rfp = await getRfpHeader(session.workspaceId, rfpId);
  if (!rfp) notFound();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b bg-card/60">
        <Stepper rfpId={rfp.id} status={rfp.status} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
