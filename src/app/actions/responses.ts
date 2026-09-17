"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAudit } from "@/db/audit";
import { db } from "@/db/client";
import { createJob } from "@/db/jobs";
import { responses, rfpQuestions, rfps } from "@/db/schema";
import { draftRequested } from "@/inngest/client";
import { ActionError, requireCan, requireRfp, runAction, type ActionResult } from "@/lib/actions";
import { requireJobRunner, sendJobEvent } from "@/lib/jobs";

const DRAFTABLE = new Set(["questions_ready", "drafting", "in_review", "approved"]);

/**
 * Queue drafting for the given questions (default: every question without a
 * response). Returns the job id the workspace polls.
 */
export async function draftRfp(rfpId: string, questionIds?: string[]): Promise<ActionResult<{ jobId: string; count: number }>> {
  return runAction(async () => {
    const session = await requireCan("response.draft");
    const rfp = await requireRfp(session, rfpId);
    if (!DRAFTABLE.has(rfp.status)) throw new ActionError("Confirm the question list before drafting.");
    requireJobRunner();

    let ids: string[];
    if (questionIds?.length) {
      const wanted = z.array(z.string().uuid()).parse(questionIds);
      ids = (await db.select({ id: rfpQuestions.id }).from(rfpQuestions).where(and(eq(rfpQuestions.rfpId, rfpId), inArray(rfpQuestions.id, wanted)))).map((r) => r.id);
    } else {
      ids = (
        await db
          .select({ id: rfpQuestions.id })
          .from(rfpQuestions)
          .leftJoin(responses, eq(responses.questionId, rfpQuestions.id))
          .where(and(eq(rfpQuestions.rfpId, rfpId), isNull(responses.id)))
          .orderBy(rfpQuestions.sortOrder)
      ).map((r) => r.id);
    }
    if (!ids.length) throw new ActionError("Nothing to draft — every question already has a response.");

    const jobId = await createJob({ rfpId, jobType: "draft", dedupeKey: "draft:all", payload: { questionIds: ids }, createdBy: session.userId, progressTotal: ids.length });
    if (!jobId) throw new ActionError("Drafting is already running for this RFP — give it a moment.");
    await sendJobEvent(draftRequested.create({ rfpId, workspaceId: session.workspaceId, jobId, questionIds: ids, actorId: session.userId }), { jobId });
    if (rfp.status === "questions_ready") await db.update(rfps).set({ status: "drafting" }).where(eq(rfps.id, rfpId));
    await writeAudit(db, { workspaceId: session.workspaceId, actorId: session.userId, entity: "rfp", entityId: rfpId, action: "draft.started", diff: { jobId, count: ids.length } });
    revalidatePath(`/rfps/${rfpId}`, "layout");
    return { jobId, count: ids.length };
  });
}

/** Regenerate one response with a free-text instruction, saved on the new revision. */
export async function regenerateResponse(rfpId: string, questionId: string, instruction: string): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const session = await requireCan("response.draft");
    const rfp = await requireRfp(session, rfpId);
    if (!DRAFTABLE.has(rfp.status)) throw new ActionError("Confirm the question list before drafting.");
    requireJobRunner();
    const text = z.string().trim().max(600).parse(instruction);
    const [q] = await db.select({ id: rfpQuestions.id }).from(rfpQuestions).where(and(eq(rfpQuestions.id, questionId), eq(rfpQuestions.rfpId, rfpId))).limit(1);
    if (!q) throw new ActionError("Question not found.");

    const jobId = await createJob({ rfpId, jobType: "draft", dedupeKey: `draft:q:${q.id}`, payload: { questionIds: [q.id], instruction: text }, createdBy: session.userId, progressTotal: 1 });
    if (!jobId) throw new ActionError("This answer is already being regenerated — give it a moment.");
    await sendJobEvent(draftRequested.create({ rfpId, workspaceId: session.workspaceId, jobId, questionIds: [q.id], instruction: text || undefined, actorId: session.userId }), { jobId });
    await writeAudit(db, { workspaceId: session.workspaceId, actorId: session.userId, entity: "rfp_question", entityId: q.id, action: "response.regenerate", diff: { instruction: text } });
    return { jobId };
  });
}
