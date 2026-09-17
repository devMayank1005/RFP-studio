"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAudit } from "@/db/audit";
import { db } from "@/db/client";
import { createJob } from "@/db/jobs";
import { generationJobs, rfpDocuments, rfps } from "@/db/schema";
import { DOCUMENT_KINDS, type DocumentKind } from "@/domain/enums";
import { documentUploaded, extractRequested } from "@/inngest/client";
import { ActionError, requireCan, requireRfp, runAction, type ActionResult } from "@/lib/actions";
import { deletePrivate, rfpUploadPath, uploadPrivate } from "@/lib/blob";
import { requireJobRunner, sendJobEvent } from "@/lib/jobs";
import { detectKind } from "@/lib/parsing";

const MAX_BYTES = 20 * 1024 * 1024;

/** A document whose parse job never reached the runner is shown as failed with the reason, not "Queued" forever. */
async function markParseFailed(documentId: string, reason: string) {
  await db.update(rfpDocuments).set({ parseStatus: "failed", parseError: `Not queued: ${reason}` }).where(eq(rfpDocuments.id, documentId));
}

/**
 * Wizard step 2. Each file goes to private Blob storage, gets a document row
 * and a parse job, and the job is handed to Inngest. Returns the job ids so
 * the client can poll them.
 */
export async function uploadDocuments(rfpId: string, formData: FormData): Promise<ActionResult<{ jobIds: string[] }>> {
  return runAction(async () => {
    const session = await requireCan("rfp.edit");
    const rfp = await requireRfp(session, rfpId);
    if (!["draft", "parsing"].includes(rfp.status)) throw new ActionError("Documents can only be added before questions are confirmed.");
    requireJobRunner();

    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const kinds = formData.getAll("kinds").map(String);
    if (!files.length) throw new ActionError("Choose at least one file.");

    const jobIds: string[] = [];
    for (const [i, file] of files.entries()) {
      const kind = z.enum(DOCUMENT_KINDS).catch("rfp_main").parse(kinds[i]) as DocumentKind;
      if (!detectKind(file.name, file.type)) throw new ActionError(`${file.name}: only .xlsx, .pdf and .docx are supported.`);
      if (file.size > MAX_BYTES) throw new ActionError(`${file.name} is larger than 20 MB.`);

      const { url } = await uploadPrivate(rfpUploadPath(rfpId, file.name), file, file.type || undefined);
      const [doc] = await db
        .insert(rfpDocuments)
        .values({
          rfpId,
          kind,
          fileName: file.name,
          fileUrl: url,
          mime: file.type || "application/octet-stream",
          sizeBytes: file.size,
          uploadedBy: session.userId,
        })
        .returning({ id: rfpDocuments.id });

      const jobId = await createJob({ rfpId, jobType: "parse", dedupeKey: `parse:${doc.id}`, payload: { documentId: doc.id, fileName: file.name }, createdBy: session.userId, progressTotal: 1 });
      if (!jobId) throw new ActionError("That job is already running — give it a moment.");
      await sendJobEvent(documentUploaded.create({ rfpId, workspaceId: session.workspaceId, documentId: doc.id, jobId }), { jobId, onFailure: (reason) => markParseFailed(doc.id, reason) });
      jobIds.push(jobId);

      await writeAudit(db, {
        workspaceId: session.workspaceId,
        actorId: session.userId,
        entity: "rfp_document",
        entityId: doc.id,
        action: "document.uploaded",
        diff: { fileName: file.name, kind, sizeBytes: file.size },
      });
    }

    if (rfp.status === "draft") await db.update(rfps).set({ status: "parsing" }).where(eq(rfps.id, rfpId));
    revalidatePath(`/rfps/${rfpId}/setup/upload`);
    return { jobIds };
  });
}

export async function deleteDocument(rfpId: string, documentId: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireCan("rfp.edit");
    const rfp = await requireRfp(session, rfpId);
    if (!["draft", "parsing"].includes(rfp.status)) throw new ActionError("Documents are locked once questions are confirmed.");

    const [doc] = await db
      .select({ id: rfpDocuments.id, fileUrl: rfpDocuments.fileUrl, parsedTextUrl: rfpDocuments.parsedTextUrl, fileName: rfpDocuments.fileName })
      .from(rfpDocuments)
      .where(and(eq(rfpDocuments.id, documentId), eq(rfpDocuments.rfpId, rfpId)))
      .limit(1);
    if (!doc) throw new ActionError("Document not found.");

    await db.delete(rfpDocuments).where(eq(rfpDocuments.id, documentId));
    await deletePrivate([doc.fileUrl, ...(doc.parsedTextUrl ? [doc.parsedTextUrl] : [])]);
    await writeAudit(db, {
      workspaceId: session.workspaceId,
      actorId: session.userId,
      entity: "rfp_document",
      entityId: documentId,
      action: "document.deleted",
      diff: { fileName: doc.fileName },
    });
    revalidatePath(`/rfps/${rfpId}/setup/upload`);
    return undefined;
  });
}

/** Wizard step 2 → 3. Needs at least one parsed RFP document; queues the extraction job. */
export async function startExtraction(rfpId: string): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const session = await requireCan("rfp.edit");
    const rfp = await requireRfp(session, rfpId);
    if (!["draft", "parsing"].includes(rfp.status)) throw new ActionError("Questions are already confirmed for this RFP.");

    const parsed = await db
      .select({ id: rfpDocuments.id })
      .from(rfpDocuments)
      .where(
        and(
          eq(rfpDocuments.rfpId, rfpId),
          eq(rfpDocuments.parseStatus, "parsed"),
          inArray(rfpDocuments.kind, ["rfp_main", "appendix"]),
        ),
      );
    if (!parsed.length) throw new ActionError("Upload and parse at least one RFP document first.");
    requireJobRunner();

    const jobId = await createJob({ rfpId, jobType: "extract", dedupeKey: "extract", payload: { documentIds: parsed.map((d) => d.id) }, createdBy: session.userId });
    if (!jobId) throw new ActionError("Extraction is already running — give it a moment.");
    await sendJobEvent(extractRequested.create({ rfpId, workspaceId: session.workspaceId, jobId }), { jobId });
    await writeAudit(db, {
      workspaceId: session.workspaceId,
      actorId: session.userId,
      entity: "rfp",
      entityId: rfpId,
      action: "extraction.started",
      diff: { jobId, documents: parsed.length },
    });
    revalidatePath(`/rfps/${rfpId}/setup/questions`);
    return { jobId };
  });
}

/**
 * Parse a document again — after a failure, or when its first job was never
 * picked up (the Inngest app was not registered at the time). Any queued parse
 * job for the document is retired first so the list shows one truth.
 */
export async function retryParse(rfpId: string, documentId: string): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const session = await requireCan("rfp.edit");
    const rfp = await requireRfp(session, rfpId);
    if (!["draft", "parsing"].includes(rfp.status)) throw new ActionError("Documents are locked once questions are confirmed.");
    requireJobRunner();

    const [doc] = await db
      .select({ id: rfpDocuments.id, fileName: rfpDocuments.fileName, parseStatus: rfpDocuments.parseStatus })
      .from(rfpDocuments)
      .where(and(eq(rfpDocuments.id, documentId), eq(rfpDocuments.rfpId, rfpId)))
      .limit(1);
    if (!doc) throw new ActionError("Document not found.");
    if (doc.parseStatus === "parsed") throw new ActionError("This document is already parsed.");
    if (doc.parseStatus === "parsing") throw new ActionError("This document is being parsed right now.");

    await db
      .update(generationJobs)
      .set({ status: "failed", error: "Superseded by a retry.", finishedAt: new Date() })
      .where(and(eq(generationJobs.rfpId, rfpId), eq(generationJobs.jobType, "parse"), eq(generationJobs.status, "queued"), sql`${generationJobs.payload}->>'documentId' = ${doc.id}`));
    await db.update(rfpDocuments).set({ parseStatus: "pending", parseError: null }).where(eq(rfpDocuments.id, doc.id));

    const jobId = await createJob({ rfpId, jobType: "parse", dedupeKey: `parse:${doc.id}`, payload: { documentId: doc.id, fileName: doc.fileName, retry: true }, createdBy: session.userId, progressTotal: 1 });
    if (!jobId) throw new ActionError("That job is already running — give it a moment.");
    await sendJobEvent(documentUploaded.create({ rfpId, workspaceId: session.workspaceId, documentId: doc.id, jobId }), { jobId, onFailure: (reason) => markParseFailed(doc.id, reason) });
    await writeAudit(db, { workspaceId: session.workspaceId, actorId: session.userId, entity: "rfp_document", entityId: doc.id, action: "document.parse_retried", diff: { fileName: doc.fileName, jobId } });
    revalidatePath(`/rfps/${rfpId}/setup/upload`);
    return { jobId };
  });
}
