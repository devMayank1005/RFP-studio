"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAudit } from "@/db/audit";
import { db } from "@/db/client";
import { createJob, finishJob } from "@/db/jobs";
import { activeBrandTemplateId, activeExport, createExportRow, deleteExportRow, finishExportRow, getExport, getExportReadinessRows, hasFillableWorkbook, setExportJob } from "@/db/queries/exports";
import { EXPORT_FORMATS, type ExportFormat } from "@/domain/enums";
import { EXPORT_FORMAT_META, EXPORT_SHAPES, normaliseExportOptions, type ExportOptions } from "@/domain/export";
import { isStaleQueuedJob } from "@/domain/jobs";
import { engineConfigError } from "@/engine/client";
import { exportRequested } from "@/inngest/client";
import { ActionError, parseInput, requireCan, requireRfp, runAction, type ActionResult } from "@/lib/actions";
import { deletePrivate } from "@/lib/blob";
import { requireJobRunner, sendJobEvent } from "@/lib/jobs";
import { requireBudget } from "@/lib/rate-limit";

/**
 * Exports: one build per request, run by Inngest. The action writes the
 * history row and the job, sends the event, and refuses anything that
 * cannot succeed — a format without a renderer, a Word build without the
 * Claude key, a second build of the same format while one runs, a filled
 * workbook when the client never sent a spreadsheet.
 */

const requestSchema = z.object({
  format: z.enum(EXPORT_FORMATS),
  options: z.object({ approvedOnly: z.boolean().optional(), shape: z.enum(EXPORT_SHAPES).optional() }).optional(),
});

function pagePath(rfpId: string) {
  return `/rfps/${rfpId}/exports`;
}

export async function requestExport(rfpId: string, format: ExportFormat, options?: ExportOptions): Promise<ActionResult<{ jobId: string; exportId: string }>> {
  return runAction(async () => {
    const session = await requireCan("export.create");
    await requireBudget(session, "jobs:user");
    const rfp = await requireRfp(session, rfpId);
    const input = parseInput(requestSchema, { format, options });
    const meta = EXPORT_FORMAT_META[input.format];
    const opts = normaliseExportOptions(input.options);
    if (!meta.available) throw new ActionError(`The ${meta.label} export arrives in a later milestone.`);
    if (meta.needsEngine && engineConfigError) throw new ActionError(engineConfigError);
    requireJobRunner();

    const active = await activeExport(rfp.id, input.format);
    if (active && isStaleQueuedJob(active)) {
      // Nothing picked it up — the Inngest app was not registered when it was sent. Retire it so the button works again.
      await finishExportRow(active.id, { status: "failed", error: "No worker picked this build up. Check the Inngest app is registered, then try again." });
      if (active.jobId) await finishJob(active.jobId, "failed", "No worker picked this job up. Check the Inngest app is registered (curl -X PUT …/api/inngest), then try again.");
    }

    const rows = await getExportReadinessRows(session.workspaceId, rfp.id);
    if (!rows?.length) throw new ActionError("There are no questions to export yet.");
    if (input.format === "xlsx" && opts.shape === "fill" && !(await hasFillableWorkbook(rfp.id))) {
      throw new ActionError("This RFP has no parsed Excel questionnaire to fill in — build a fresh workbook instead.");
    }

    const brandTemplateId = await activeBrandTemplateId(session.workspaceId);
    const exportId = await createExportRow({ rfpId: rfp.id, format: input.format, brandTemplateId, options: opts, createdBy: session.userId });
    const jobId = await createJob({ rfpId: rfp.id, jobType: "export", dedupeKey: `export:${input.format}`, payload: { exportId, format: input.format, ...opts }, createdBy: session.userId, progressTotal: meta.steps });
    if (!jobId) {
      await deleteExportRow(exportId);
      throw new ActionError(`A ${meta.label} export is already being built — give it a moment.`);
    }
    await setExportJob(exportId, jobId);
    await sendJobEvent(exportRequested.create({ rfpId: rfp.id, workspaceId: session.workspaceId, exportId, jobId, format: input.format, actorId: session.userId, options: opts }), {
      jobId,
      onFailure: (reason) => finishExportRow(exportId, { status: "failed", error: `Not queued: ${reason}` }),
    });
    await writeAudit(db, { workspaceId: session.workspaceId, actorId: session.userId, entity: "export", entityId: exportId, action: "export.requested", diff: { format: input.format, options: opts, jobId } });
    revalidatePath(pagePath(rfp.id));
    return { jobId, exportId };
  });
}

export async function deleteExport(rfpId: string, exportId: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireCan("export.create");
    const rfp = await requireRfp(session, rfpId);
    const row = await getExport(session.workspaceId, exportId);
    if (!row || row.rfpId !== rfp.id) throw new ActionError("That export is not on this RFP.");
    if (row.status === "queued" || row.status === "running") throw new ActionError("Wait for the build to finish before deleting it.");
    const deleted = await deleteExportRow(row.id);
    if (deleted?.fileUrl) await deletePrivate([deleted.fileUrl]).catch(() => undefined);
    await writeAudit(db, { workspaceId: session.workspaceId, actorId: session.userId, entity: "export", entityId: row.id, action: "export.deleted", diff: { format: row.format, fileName: row.fileName } });
    revalidatePath(pagePath(rfp.id));
    return undefined;
  });
}
