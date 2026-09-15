"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { writeAudit } from "@/db/audit";
import { db } from "@/db/client";
import { responseRevisions, responses, rfpQuestions, rfps } from "@/db/schema";
import { ActionError, requireCan, requireRfp, runAction, type ActionResult } from "@/lib/actions";

/**
 * Review-loop mutations. Every action takes ids only (never rows), checks the
 * RFP belongs to the workspace, writes inside one transaction with its audit
 * row, and returns the minimum the client needs to reconcile its cache.
 * `revalidatePath` is deliberately absent: the workspace owns its data via
 * TanStack Query and invalidates itself.
 */

async function ownedResponses(rfpId: string, questionIds: string[]) {
  return db
    .select({ id: responses.id, questionId: responses.questionId, status: responses.status })
    .from(responses)
    .innerJoin(rfpQuestions, eq(responses.questionId, rfpQuestions.id))
    .where(and(eq(rfpQuestions.rfpId, rfpId), inArray(rfpQuestions.id, questionIds)));
}

export async function approveResponses(rfpId: string, questionIds: string[]): Promise<ActionResult<{ approved: string[] }>> {
  return runAction(async () => {
    const session = await requireCan("response.approve");
    await requireRfp(session, rfpId);
    const ids = z.array(z.string().uuid()).min(1).parse(questionIds);
    const rows = await ownedResponses(rfpId, ids);
    if (!rows.length) throw new ActionError("Nothing to approve — these questions have no response yet.");

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(responses)
        .set({ status: "approved", approvedBy: session.userId, approvedAt: now, flagReason: null })
        .where(inArray(responses.id, rows.map((r) => r.id)));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "rfp", entityId: rfpId, action: "responses.approved", diff: { questionIds: rows.map((r) => r.questionId) } });
      // The RFP is "approved" once every question is; otherwise it stays in review.
    });
    await settleRfpStatus(rfpId);
    return { approved: rows.map((r) => r.questionId) };
  });
}

export async function unapproveResponses(rfpId: string, questionIds: string[]): Promise<ActionResult<{ updated: string[] }>> {
  return runAction(async () => {
    const session = await requireCan("response.approve");
    await requireRfp(session, rfpId);
    const ids = z.array(z.string().uuid()).min(1).parse(questionIds);
    const rows = await ownedResponses(rfpId, ids);
    await db.transaction(async (tx) => {
      await tx.update(responses).set({ status: "edited", approvedBy: null, approvedAt: null }).where(inArray(responses.id, rows.map((r) => r.id)));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "rfp", entityId: rfpId, action: "responses.unapproved", diff: { questionIds: rows.map((r) => r.questionId) } });
    });
    await settleRfpStatus(rfpId);
    return { updated: rows.map((r) => r.questionId) };
  });
}

export async function flagResponse(rfpId: string, questionId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireCan("response.flag");
    await requireRfp(session, rfpId);
    const text = z.string().trim().max(400).parse(reason);
    const [row] = await ownedResponses(rfpId, [questionId]);
    if (!row) throw new ActionError("No response to flag yet.");
    await db.transaction(async (tx) => {
      await tx.update(responses).set({ status: "flagged", flagReason: text || null, approvedBy: null, approvedAt: null }).where(eq(responses.id, row.id));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "response", entityId: row.id, action: "response.flagged", diff: { reason: text } });
    });
    await settleRfpStatus(rfpId);
    return undefined;
  });
}

/** A human edit: a new revision whose draftText is the previous final text and finalText is what they typed. */
export async function editResponse(rfpId: string, questionId: string, finalText: string): Promise<ActionResult<{ revisionId: string; version: number }>> {
  return runAction(async () => {
    const session = await requireCan("response.edit");
    await requireRfp(session, rfpId);
    const text = z.string().trim().min(1, "Write something first.").max(20_000).parse(finalText);

    const [row] = await ownedResponses(rfpId, [questionId]);
    const result = await db.transaction(async (tx) => {
      let responseId = row?.id;
      if (!responseId) {
        const [created] = await tx.insert(responses).values({ questionId, status: "edited" }).returning({ id: responses.id });
        responseId = created.id;
      }
      const [latest] = await tx
        .select({ version: responseRevisions.version, finalText: responseRevisions.finalText })
        .from(responseRevisions)
        .where(eq(responseRevisions.responseId, responseId))
        .orderBy(desc(responseRevisions.version))
        .limit(1);
      if (latest && latest.finalText.trim() === text) throw new ActionError("No changes to save.");

      const [revision] = await tx
        .insert(responseRevisions)
        .values({
          responseId,
          version: (latest?.version ?? 0) + 1,
          draftText: latest?.finalText ?? "",
          finalText: text,
          generatedBy: "user",
          authorId: session.userId,
        })
        .returning({ id: responseRevisions.id, version: responseRevisions.version });
      await tx
        .update(responses)
        .set({ currentRevisionId: revision.id, status: "edited", approvedBy: null, approvedAt: null })
        .where(eq(responses.id, responseId));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "response", entityId: responseId, action: "response.edited", diff: { version: revision.version } });
      return { revisionId: revision.id, version: revision.version };
    });
    await settleRfpStatus(rfpId);
    return result;
  });
}

export async function setCompliance(rfpId: string, questionId: string, compliance: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireCan("response.edit");
    await requireRfp(session, rfpId);
    const value = z.enum(["fully", "partial", "via_customization", "via_partner", "not_supported", "na"]).parse(compliance);
    const [row] = await ownedResponses(rfpId, [questionId]);
    if (!row) throw new ActionError("No response yet.");
    await db.transaction(async (tx) => {
      await tx.update(responses).set({ compliance: value }).where(eq(responses.id, row.id));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "response", entityId: row.id, action: "response.compliance", diff: { compliance: value } });
    });
    return undefined;
  });
}

/** Moves the RFP between in_review / approved as approvals change. Cheap: one aggregate. */
async function settleRfpStatus(rfpId: string) {
  const [rfp] = await db.select({ status: rfps.status }).from(rfps).where(eq(rfps.id, rfpId)).limit(1);
  if (!rfp || !["drafting", "in_review", "approved", "questions_ready"].includes(rfp.status)) return;
  const rows = await db
    .select({ status: responses.status })
    .from(responses)
    .innerJoin(rfpQuestions, eq(responses.questionId, rfpQuestions.id))
    .where(eq(rfpQuestions.rfpId, rfpId));
  const [{ total }] = await db.select({ total: rfpQuestions.id }).from(rfpQuestions).where(eq(rfpQuestions.rfpId, rfpId)).then((r) => [{ total: r.length }]);
  const allApproved = total > 0 && rows.length === total && rows.every((r) => r.status === "approved");
  const next = allApproved ? "approved" : rows.length ? "in_review" : rfp.status;
  if (next !== rfp.status) await db.update(rfps).set({ status: next }).where(eq(rfps.id, rfpId));
}
