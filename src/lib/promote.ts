import "server-only";

import { and, eq } from "drizzle-orm";

import { writeAudit } from "@/db/audit";
import { db } from "@/db/client";
import { approvedAnswers, clients, responseRevisions, responses, rfpQuestions, type rfps } from "@/db/schema";
import { QUICK_CLIENT_NAME } from "@/domain/quick";
import { engineConfigError } from "@/engine/client";
import { approvedAnswerEmbedText, embedConfigError, embedDocuments } from "@/engine/embed";
import { generaliseAnswer } from "@/engine/generalise";
import { ActionError } from "@/lib/actions";
import type { AppSession } from "@/lib/session";

/**
 * "Add to KB": promote an approved answer into `approved_answers` — the
 * flywheel. The pair is generalised by Claude (client name stripped, checked
 * again in code), embedded with Voyage, and from then on retrieved as a
 * passage for every later RFP. One row per response; promoting twice refuses.
 * Shared by the workspace's promoteToKb and Quick Q&A's approveAndPromote;
 * callers have already checked `kb.promote` and the RFP's workspace.
 */
export async function promoteResponse(session: AppSession, rfp: typeof rfps.$inferSelect, questionId: string): Promise<{ approvedAnswerId: string; canonicalQuestion: string }> {
  if (engineConfigError) throw new ActionError(engineConfigError);
  const embedError = embedConfigError();
  if (embedError) throw new ActionError(embedError);

  const [row] = await db
    .select({
      questionText: rfpQuestions.questionText,
      acceptanceCriteria: rfpQuestions.acceptanceCriteria,
      moduleHint: rfpQuestions.moduleHint,
      responseId: responses.id,
      status: responses.status,
      finalText: responseRevisions.finalText,
    })
    .from(rfpQuestions)
    .innerJoin(responses, eq(responses.questionId, rfpQuestions.id))
    .leftJoin(responseRevisions, eq(responseRevisions.id, responses.currentRevisionId))
    .where(and(eq(rfpQuestions.id, questionId), eq(rfpQuestions.rfpId, rfp.id)))
    .limit(1);
  if (!row) throw new ActionError("No response to add yet.");
  if (row.status !== "approved") throw new ActionError("Approve the answer first — only approved answers go into the knowledge base.");
  if (!row.finalText?.trim()) throw new ActionError("The approved answer is empty.");

  const [already] = await db.select({ id: approvedAnswers.id }).from(approvedAnswers).where(eq(approvedAnswers.originResponseId, row.responseId)).limit(1);
  if (already) throw new ActionError("This answer is already in the knowledge base.");

  const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, rfp.clientId)).limit(1);
  // The Quick Q&A sentinel is not a client: scrubbing its name would strip "Quick" from answers.
  const clientName = !client || client.name === QUICK_CLIENT_NAME ? "" : client.name;
  const { result, usage, model } = await generaliseAnswer({
    clientName,
    questionText: row.questionText,
    acceptanceCriteria: row.acceptanceCriteria,
    answerText: row.finalText,
    moduleHint: row.moduleHint,
  });
  const [embedding] = await embedDocuments([approvedAnswerEmbedText({ canonicalQuestion: result.canonical_question, canonicalAnswer: result.canonical_answer })]);

  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(approvedAnswers)
      .values({
        workspaceId: session.workspaceId,
        originResponseId: row.responseId,
        originRfpId: rfp.id,
        canonicalQuestion: result.canonical_question,
        canonicalAnswer: result.canonical_answer,
        module: result.module,
        tags: result.tags,
        embedding,
      })
      .returning({ id: approvedAnswers.id });
    await writeAudit(tx, {
      workspaceId: session.workspaceId,
      actorId: session.userId,
      entity: "approved_answer",
      entityId: inserted.id,
      action: "kb.promoted",
      diff: { rfpId: rfp.id, questionId, responseId: row.responseId, model, usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } },
    });
    return { approvedAnswerId: inserted.id, canonicalQuestion: result.canonical_question };
  });
}
