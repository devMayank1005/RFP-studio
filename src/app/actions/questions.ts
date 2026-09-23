"use server";

import { and, asc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAudit } from "@/db/audit";
import { db } from "@/db/client";
import { responseRevisions, responses, rfpQuestions, rfpSections, rfps } from "@/db/schema";
import { chunk, mapExistingCompliance } from "@/domain/extraction";
import { MODULES, OWNERS, QUESTION_TYPES } from "@/domain/enums";
import { ActionError, parseInput, requireCan, requireRfp, runAction, type ActionResult } from "@/lib/actions";

const REVIEWABLE = ["draft", "parsing"] as const;

async function requireEditableRfp(rfpId: string) {
  const session = await requireCan("question.confirm");
  const rfp = await requireRfp(session, rfpId);
  if (!(REVIEWABLE as readonly string[]).includes(rfp.status)) throw new ActionError("Questions are confirmed; edit them from the workspace instead.");
  return { session, rfp };
}

const patchSchema = z.object({
  questionText: z.string().trim().min(1).max(4000).optional(),
  refNo: z.string().trim().min(1).max(40).optional(),
  sectionId: z.string().uuid().nullable().optional(),
  questionType: z.enum(QUESTION_TYPES).optional(),
  isMandatory: z.boolean().optional(),
  owner: z.enum(OWNERS).optional(),
  moduleHint: z.enum(MODULES).optional(),
});
export type QuestionPatch = z.infer<typeof patchSchema>;

/**
 * Patch one question's fields during setup.
 * @throws {ActionError} If the role cannot confirm questions, the RFP is not in the workspace, questions are already confirmed, the patch fails validation, or the question is not on this RFP.
 * @sideEffects Updates `rfp_questions` and writes one `audit_log` row; revalidates the questions step.
 */
export async function updateQuestion(rfpId: string, questionId: string, patch: QuestionPatch): Promise<ActionResult> {
  return runAction(async () => {
    const { session } = await requireEditableRfp(rfpId);
    const input = parseInput(patchSchema, patch);
    const [updated] = await db
      .update(rfpQuestions)
      .set(input)
      .where(and(eq(rfpQuestions.id, questionId), eq(rfpQuestions.rfpId, rfpId)))
      .returning({ id: rfpQuestions.id });
    if (!updated) throw new ActionError("Question not found.");
    await writeAudit(db, { workspaceId: session.workspaceId, actorId: session.userId, entity: "rfp_question", entityId: questionId, action: "question.updated", diff: input });
    revalidatePath(`/rfps/${rfpId}/setup/questions`);
    return undefined;
  });
}

/**
 * Delete the selected questions during setup.
 * @throws {ActionError} If the role cannot confirm questions, the RFP is not in the workspace, or questions are already confirmed.
 * @sideEffects Deletes from `rfp_questions` and writes one `audit_log` row; revalidates the questions step.
 */
export async function deleteQuestions(rfpId: string, questionIds: string[]): Promise<ActionResult<{ deleted: number }>> {
  return runAction(async () => {
    const { session } = await requireEditableRfp(rfpId);
    const ids = z.array(z.string().uuid()).min(1).parse(questionIds);
    const deleted = await db
      .delete(rfpQuestions)
      .where(and(eq(rfpQuestions.rfpId, rfpId), inArray(rfpQuestions.id, ids)))
      .returning({ id: rfpQuestions.id });
    await writeAudit(db, { workspaceId: session.workspaceId, actorId: session.userId, entity: "rfp", entityId: rfpId, action: "questions.deleted", diff: { ids } });
    revalidatePath(`/rfps/${rfpId}/setup/questions`);
    return { deleted: deleted.length };
  });
}

/** Folds several rows into the first: texts joined, client columns kept from each, the rest deleted. */
export async function mergeQuestions(rfpId: string, questionIds: string[]): Promise<ActionResult<{ keptId: string }>> {
  return runAction(async () => {
    const { session } = await requireEditableRfp(rfpId);
    const ids = z.array(z.string().uuid()).min(2).parse(questionIds);
    const rows = await db
      .select()
      .from(rfpQuestions)
      .where(and(eq(rfpQuestions.rfpId, rfpId), inArray(rfpQuestions.id, ids)))
      .orderBy(asc(rfpQuestions.sortOrder));
    if (rows.length < 2) throw new ActionError("Select at least two questions to merge.");

    const [keep, ...rest] = rows;
    const mergedMeta: Record<string, string> = { ...keep.rawMeta };
    for (const r of rest) {
      for (const [k, v] of Object.entries(r.rawMeta)) {
        if (!mergedMeta[k]) mergedMeta[k] = v;
        else if (mergedMeta[k] !== v) mergedMeta[k] = `${mergedMeta[k]}\n${v}`;
      }
    }
    await db.transaction(async (tx) => {
      await tx
        .update(rfpQuestions)
        .set({
          questionText: rows.map((r) => r.questionText).join("\n\n"),
          acceptanceCriteria: rows.map((r) => r.acceptanceCriteria).filter(Boolean).join("\n\n") || null,
          isMandatory: rows.some((r) => r.isMandatory),
          rawMeta: mergedMeta,
        })
        .where(eq(rfpQuestions.id, keep.id));
      await tx.delete(rfpQuestions).where(inArray(rfpQuestions.id, rest.map((r) => r.id)));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "rfp_question", entityId: keep.id, action: "questions.merged", diff: { merged: rest.map((r) => r.id) } });
    });
    revalidatePath(`/rfps/${rfpId}/setup/questions`);
    return { keptId: keep.id };
  });
}

/** Splits one row into several; the first part keeps the row, the rest are inserted right after it. */
export async function splitQuestion(rfpId: string, questionId: string, parts: string[]): Promise<ActionResult<{ created: number }>> {
  return runAction(async () => {
    const { session } = await requireEditableRfp(rfpId);
    const texts = z.array(z.string().trim().min(1)).min(2).parse(parts.map((p) => p.trim()).filter(Boolean));
    const [row] = await db.select().from(rfpQuestions).where(and(eq(rfpQuestions.id, questionId), eq(rfpQuestions.rfpId, rfpId))).limit(1);
    if (!row) throw new ActionError("Question not found.");

    await db.transaction(async (tx) => {
      const extra = texts.length - 1;
      await tx
        .update(rfpQuestions)
        .set({ sortOrder: sql`${rfpQuestions.sortOrder} + ${extra}` })
        .where(and(eq(rfpQuestions.rfpId, rfpId), gt(rfpQuestions.sortOrder, row.sortOrder)));
      await tx.update(rfpQuestions).set({ questionText: texts[0] }).where(eq(rfpQuestions.id, row.id));
      await tx.insert(rfpQuestions).values(
        texts.slice(1).map((text, i) => ({
          rfpId,
          workspaceId: row.workspaceId,
          sectionId: row.sectionId,
          refNo: `${row.refNo}.${i + 2}`,
          questionText: text,
          acceptanceCriteria: null,
          questionType: row.questionType,
          isMandatory: row.isMandatory,
          owner: row.owner,
          moduleHint: row.moduleHint,
          rawMeta: row.rawMeta,
          sourceDocumentId: row.sourceDocumentId,
          sourceRow: row.sourceRow,
          sortOrder: row.sortOrder + i + 1,
        })),
      );
      await tx.update(rfpQuestions).set({ refNo: `${row.refNo}.1` }).where(eq(rfpQuestions.id, row.id));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "rfp_question", entityId: row.id, action: "question.split", diff: { parts: texts.length } });
    });
    revalidatePath(`/rfps/${rfpId}/setup/questions`);
    return { created: texts.length - 1 };
  });
}

/**
 * Add a section at the end of the RFP's list.
 * @throws {ActionError} If the role cannot confirm questions, the RFP is not in the workspace, or questions are already confirmed.
 * @sideEffects Inserts one `rfp_sections` row (no audit row); revalidates the questions step.
 */
export async function createSection(rfpId: string, title: string): Promise<ActionResult<{ sectionId: string }>> {
  return runAction(async () => {
    await requireEditableRfp(rfpId);
    const name = z.string().trim().min(1).max(120).parse(title);
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${rfpSections.sortOrder}), -1)`.mapWith(Number) }).from(rfpSections).where(eq(rfpSections.rfpId, rfpId));
    const [section] = await db.insert(rfpSections).values({ rfpId, title: name, sortOrder: max + 1 }).returning({ id: rfpSections.id });
    revalidatePath(`/rfps/${rfpId}/setup/questions`);
    return { sectionId: section.id };
  });
}

/**
 * Wizard step 4. Locks the question list, optionally imports a vendor's
 * earlier answers as revision v1, and opens the workspace. Nothing drafts
 * before this.
 */
export async function confirmQuestions(rfpId: string, opts: { importExisting: boolean }): Promise<ActionResult<{ imported: number; total: number }>> {
  return runAction(async () => {
    const { session } = await requireEditableRfp(rfpId);
    const questions = await db
      .select({ id: rfpQuestions.id, existingAnswer: rfpQuestions.existingAnswer })
      .from(rfpQuestions)
      .where(eq(rfpQuestions.rfpId, rfpId));
    if (!questions.length) throw new ActionError("There are no questions to confirm.");

    let imported = 0;
    await db.transaction(async (tx) => {
      if (opts.importExisting) {
        const withAnswers = questions.filter((q) => q.existingAnswer && (q.existingAnswer.answer || q.existingAnswer.compliance));
        // Three statements, not three per row: 200 imports over a distant database would otherwise take a minute.
        for (const batch of chunk(withAnswers, 100)) {
          const created = await tx
            .insert(responses)
            .values(batch.map((q) => ({ questionId: q.id, status: "edited" as const, compliance: mapExistingCompliance(q.existingAnswer!.compliance) })))
            .returning({ id: responses.id, questionId: responses.questionId });
          const byQuestion = new Map(created.map((c) => [c.questionId, c.id]));
          const revisions = await tx
            .insert(responseRevisions)
            .values(
              batch.map((q) => {
                const text = q.existingAnswer!.answer?.trim() || "";
                return {
                  responseId: byQuestion.get(q.id)!,
                  version: 1,
                  draftText: text,
                  finalText: text,
                  generatedBy: "import" as const,
                  authorId: session.userId,
                  promptVersion: "import",
                  openPoints: q.existingAnswer!.questions ? [q.existingAnswer!.questions] : [],
                };
              }),
            )
            .returning({ id: responseRevisions.id, responseId: responseRevisions.responseId });
          await tx.execute(sql`
            update responses r set current_revision_id = v.id
            from (values ${sql.join(revisions.map((r) => sql`(${r.responseId}::uuid, ${r.id}::uuid)`), sql`, `)}) as v(response_id, id)
            where r.id = v.response_id
          `);
          imported += batch.length;
        }
      }
      await tx.update(rfpQuestions).set({ existingAnswer: null }).where(and(eq(rfpQuestions.rfpId, rfpId), isNotNull(rfpQuestions.existingAnswer)));
      await tx.update(rfps).set({ status: "questions_ready" }).where(eq(rfps.id, rfpId));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "rfp", entityId: rfpId, action: "questions.confirmed", diff: { total: questions.length, imported } });
    });
    revalidatePath(`/rfps/${rfpId}`, "layout");
    revalidatePath("/dashboard");
    return { imported, total: questions.length };
  });
}
