import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { NewRfpForm } from "@/components/wizard/new-rfp-form";
import { Stepper } from "@/components/wizard/stepper";
import { listClients } from "@/db/queries/rfps";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "New RFP" };

/** Wizard step 1. Creates the draft RFP, then the rest of setup lives under /rfps/[id]/setup. */
export default async function NewRfpPage() {
  const session = await requireSession();
  const clients = await listClients(session.workspaceId);

  return (
    <>
      <PageHeader compact title="New RFP" description="Four steps: client, upload, review the extracted questions, confirm." />
      <div className="border-b bg-card/60">
        <Stepper rfpId="new" status="draft" />
      </div>
      <NewRfpForm clients={clients} />
    </>
  );
}
