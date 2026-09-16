"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAudit } from "@/db/audit";
import { db } from "@/db/client";
import { createJob, finishJob, latestJob } from "@/db/jobs";
import { ensureQuickClient, ownedClientId } from "@/db/queries/quick";
import { responses, rfpDocuments, rfpQuestions, rfps } from "@/db/schema";
import { todayInKolkata } from "@/domain/dates";
import { isStaleQueuedJob } from "@/domain/jobs";
import { firstLine, pastedDocument, quickInputSchema, quickTitle } from "@/domain/quick";
import { engineConfigError } from "@/engine/client";
import { embedConfigError } from "@/engine/embed";
import { quickRequested } from "@/inngest/client";
import { ActionError, requireCan, requireRfp, runAction, type ActionResult } from "@/lib/actions";
import { putJson, rfpQuickPastePath, rfpUploadPath, uploadPrivate } from "@/lib/blob";
import { requireJobRunner, sendJobEvent } from "@/lib/jobs";
import { detectKind } from "@/lib/parsing";
import { promoteResponse } from "@/lib/promote";

import { approveResponses } from "./review";

/**
 * Quick Q&A: a session is a lightweight RFP (kind = quick). Creating one
 * stores the paste or file, queues the intake job and lands on the session
 * page; the intake job hands off to the ordinary draft job. Review actions
 * are the workspace's; the one addition is approve-and-promote in one step.
 */

const MAX_BYTES = 20 * 1024 * 1024;

export type QuickCreateState = ActionResult<{ rfpId: string }> | null;

function pagePath(rfpId: string) {
  return `/quick/${rfpId}`;
}

/** useActionState entry: validate, create, queue, then redirect (outside the try — redirect throws by design). */
export async function createQuickSession(_prev: QuickCreateState, formData: FormData): Promise<QuickCreateState> {
  let rfpId: string;
  try {
    rfpId = await createQuick(formData);
  } catch (err) {
    if (err instanceof ActionError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    throw err;
  }
  redirect(pagePath(rfpId));
}

async function createQuick(formData: FormData): Promise<string> {
  const session = await requireCan("rfp.create");
  if (engineConfigError) throw new ActionError(engineConfigError);
  requireJobRunner();

  const parsed = quickInputSchema.safeParse({
    source: formData.get("source"),
    text: typeof formData.get("text") === "string" ? formData.get("text") : "",
    context: typeof formData.get("context") === "string" ? formData.get("context") : "",
    clientId: typeof formData.get("clientId") === "string" ? formData.get("clientId") : "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] ? String(issue.path[0]) : "form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new ActionError("Check the highlighted fields.", fieldErrors);
  }
  const input = parsed.data;

  const file = formData.get("file");
  let upload: File | null = null;
  if (input.source === "document") {
    if (!(file instanceof File) || file.size === 0) throw new ActionError("Choose a file.", { file: ["Choose an .xlsx, .pdf or .docx file."] });
    if (!detectKind(file.name, file.type)) throw new ActionError("That file type is not supported.", { file: ["Only .xlsx, .pdf and .docx are supported."] });
    if (file.size > MAX_BYTES) throw new ActionError("That file is too large.", { file: ["Files must be under 20 MB."] });
    upload = file;
  }

  const clientId = input.clientId ? await ownedClientId(session.workspaceId, input.clientId) : null;
  if (input.clientId && !clientId) throw new ActionError("Pick a client from the list.", { clientId: ["That client is not in your workspace."] });
  const title = quickTitle({ context: input.context, firstQuestion: input.source === "paste" ? firstLine(input.text) : (upload?.name ?? null), date: todayInKolkata() });

  const [rfp] = await db
    .insert(rfps)
    .values({ workspaceId: session.workspaceId, clientId: clientId ?? (await ensureQuickClient(session.workspaceId)), title, kind: "quick", status: "parsing", contextSummary: input.context || null, createdBy: session.userId })
    .returning({ id: rfps.id });

  try {
    let documentId: string | undefined;
    let parsedTextUrl: string | undefined;
    if (input.source === "paste") {
      parsedTextUrl = (await putJson(rfpQuickPastePath(rfp.id), pastedDocument(input.text))).url;
    } else if (upload) {
      const { url } = await uploadPrivate(rfpUploadPath(rfp.id, upload.name), upload, upload.type || undefined);
      const [doc] = await db
        .insert(rfpDocuments)
        .values({ rfpId: rfp.id, kind: "rfp_main", fileName: upload.name, fileUrl: url, mime: upload.type || "application/octet-stream", sizeBytes: upload.size, uploadedBy: session.userId })
        .returning({ id: rfpDocuments.id });
      documentId = doc.id;
    }
    const jobId = await createJob({ rfpId: rfp.id, jobType: "quick", payload: { source: input.source, documentId, parsedTextUrl, fileName: upload?.name }, createdBy: session.userId });
    await sendJobEvent(quickRequested.create({ rfpId: rfp.id, jobId, actorId: session.userId, source: input.source, documentId, parsedTextUrl }), { jobId });
  } catch (err) {
    // A failure before the job exists leaves nothing behind; a failed send is already recorded on the job.
    if (!(err instanceof ActionError)) await db.delete(rfps).where(eq(rfps.id, rfp.id));
    throw err;
  }

  await writeAudit(db, {
    workspaceId: session.workspaceId,
    actorId: session.userId,
    entity: "rfp",
    entityId: rfp.id,
    action: "quick.created",
    diff: { source: input.source, clientId, chars: input.text.length, fileName: upload?.name ?? null },
  });
  revalidatePath("/quick");
  return rfp.id;
}

/** Run the intake again after a failure, or when no worker picked it up. */
export async function retryQuickIntake(rfpId: string): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const session = await requireCan("rfp.edit");
    const rfp = await requireRfp(session, rfpId);
    if (rfp.kind !== "quick") throw new ActionError("Not a Quick Q&A session.");
    if (rfp.status !== "parsing") throw new ActionError("The questions are already in — draft them from the session page.");
    requireJobRunner();
    const last = await latestJob(rfp.id, "quick");
    if (!last) throw new ActionError("Nothing to retry.");
    if (last.status === "running" || (last.status === "queued" && !isStaleQueuedJob(last))) throw new ActionError("The intake is still running — give it a moment.");
    if (last.status === "queued") await finishJob(last.id, "failed", "No worker picked this job up. Check the Inngest app is registered (curl -X PUT …/api/inngest), then try again.");
    const payload = last.payload as { source?: "paste" | "document"; documentId?: string; parsedTextUrl?: string; fileName?: string };
    if (!payload.source) throw new ActionError("The original input is missing; start a new session.");
    const jobId = await createJob({ rfpId: rfp.id, jobType: "quick", payload: { ...payload, retryOf: last.id }, createdBy: session.userId });
    await sendJobEvent(quickRequested.create({ rfpId: rfp.id, jobId, actorId: session.userId, source: payload.source, documentId: payload.documentId, parsedTextUrl: payload.parsedTextUrl }), { jobId });
    await writeAudit(db, { workspaceId: session.workspaceId, actorId: session.userId, entity: "rfp", entityId: rfp.id, action: "quick.retried", diff: { jobId, retryOf: last.id } });
    revalidatePath(pagePath(rfp.id));
    return { jobId };
  });
}

/** One click: approve the answer if it is not yet, then promote it as a client-neutral precedent. */
export async function approveAndPromote(rfpId: string, questionId: string): Promise<ActionResult<{ approvedAnswerId: string; canonicalQuestion: string }>> {
  return runAction(async () => {
    const session = await requireCan("kb.promote");
    const rfp = await requireRfp(session, rfpId);
    const qid = z.string().uuid().parse(questionId);
    // Configuration problems are refused before anything is approved, so a half-done click cannot happen.
    if (engineConfigError) throw new ActionError(engineConfigError);
    const embedError = embedConfigError();
    if (embedError) throw new ActionError(embedError);

    const [row] = await db
      .select({ status: responses.status })
      .from(responses)
      .innerJoin(rfpQuestions, eq(rfpQuestions.id, responses.questionId))
      .where(and(eq(rfpQuestions.id, qid), eq(rfpQuestions.rfpId, rfp.id)))
      .limit(1);
    if (!row) throw new ActionError("No response to add yet.");
    if (row.status !== "approved") {
      // The review action carries its own permission check, audit row and RFP status settle.
      const approved = await approveResponses(rfp.id, [qid]);
      if (!approved.ok) throw new ActionError(approved.error);
    }
    const result = await promoteResponse(session, rfp, qid);
    revalidatePath(pagePath(rfp.id));
    return result;
  });
}
