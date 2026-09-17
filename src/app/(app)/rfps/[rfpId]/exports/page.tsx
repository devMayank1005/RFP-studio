import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ExportsPanel } from "@/components/exports/exports-panel";
import { getExportReadinessRows, hasFillableWorkbook, listExports } from "@/db/queries/exports";
import { getRfpHeader } from "@/db/queries/rfps";
import { exportReadiness } from "@/domain/export";
import { engineConfigError } from "@/engine/client";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Exports" };

/** Branded files for the client: an Excel workbook (fresh, or theirs filled in) and a Word response document. */
export default async function ExportsPage({ params }: PageProps<"/rfps/[rfpId]/exports">) {
  const [session, { rfpId }] = await Promise.all([requireSession(), params]);
  const [rfp, rows, history, canFill] = await Promise.all([
    getRfpHeader(session.workspaceId, rfpId),
    getExportReadinessRows(session.workspaceId, rfpId),
    listExports(session.workspaceId, rfpId),
    hasFillableWorkbook(rfpId),
  ]);
  if (!rfp || !rows || !history) notFound();

  return (
    <ExportsPanel
      rfpId={rfp.id}
      readiness={exportReadiness(rows)}
      history={history}
      role={session.role}
      engineError={engineConfigError}
      canFill={canFill}
      now={new Date()}
    />
  );
}
