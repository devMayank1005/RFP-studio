import { Info } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocumentList } from "@/components/wizard/document-list";
import { UploadDropzone } from "@/components/wizard/upload-dropzone";
import { listDocuments } from "@/db/queries/documents";
import { getRfpHeader } from "@/db/queries/rfps";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Upload" };

/** Wizard step 2: the files. */
export default async function UploadPage({ params }: PageProps<"/rfps/[rfpId]/setup/upload">) {
  const [session, { rfpId }] = await Promise.all([requireSession(), params]);
  const [rfp, documents] = await Promise.all([getRfpHeader(session.workspaceId, rfpId), listDocuments(session.workspaceId, rfpId)]);
  if (!rfp) notFound();
  const locked = !["draft", "parsing"].includes(rfp.status);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
      <div>
        <h2 className="font-heading text-base font-semibold">Upload the RFP</h2>
        <p className="text-ui text-muted-foreground">
          The main RFP and any appendices become questions. Client pointers (a brief, background notes, a demerger memo) shape the context every
          answer is drafted against.
        </p>
      </div>
      {!locked && <UploadDropzone rfpId={rfpId} />}
      <DocumentList rfpId={rfpId} documents={documents} locked={locked} now={new Date()} />
      {locked && (
        <p className="flex items-start gap-2 rounded-md border bg-muted/50 p-3 text-ui text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          Questions are confirmed for this RFP, so its documents are locked. Edit questions from the workspace.
        </p>
      )}
    </div>
  );
}
