import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db, withOrg } from "@/db/client";
import { bumpJobProgress, finishJob, markJobRunning, setJobProgress } from "@/db/jobs";
import { getActiveBrand } from "@/db/queries/brand";
import { retrieveApprovedAnswers, retrieveEntries } from "@/db/queries/kb";
import { approvedAnswers, responseCitations, responseRevisions, responses, rfpQuestions, rfps } from "@/db/schema";
import { numberPassages, type Passage } from "@/domain/drafting";
import { draftResponse } from "@/engine/draft";
import { embedQuery, questionEmbedText } from "@/engine/embed";
import { chunk } from "@/domain/extraction";

import { DRAFT_PROMPT_VERSION } from "../../prompts/draft";

import { draftRequested, inngest } from "./client";

const PARALLEL = 5;

interface DraftOneResult {
  questionId: string;
  ok: boolean;
  error?: string;
  compliance?: string;
  confidence?: number;
}

/**
 * The core loop. Every question is its own durable step, five at a time; a
 * question that fails is recorded and skipped — it never blocks the batch.
 * Regenerate is the same function with one question id and an instruction.
 */
export const draftResponses = inngest.createFunction(
  {
    id: "draft-responses",
    retries: 1,
    // A re-delivered event for the same job never starts a second run.
    idempotency: "event.data.jobId",
    // Per-workspace fairness first, then a global ceiling.
    concurrency: [
      { limit: 2, key: "event.data.workspaceId" },
      { limit: 4 },
    ],
    triggers: [draftRequested],
    onFailure: async ({ event, error }) => {
      await finishJob(event.data.event.data.jobId, "failed", error.message);
    },
  },
  async ({ event, step, runId }) => {
    const { rfpId, workspaceId, jobId, questionIds, instruction, actorId } = event.data;

    const ctx = await step.run("prepare", async () => {
      await markJobRunning(jobId, runId);
      await setJobProgress(jobId, 0, questionIds.length);
      const [rfp] = await withOrg(workspaceId, (tx) => tx.select({ workspaceId: rfps.workspaceId, contextSummary: rfps.contextSummary, status: rfps.status }).from(rfps).where(eq(rfps.id, rfpId)).limit(1));
      if (!rfp) throw new NonRetriableError("rfp not found");
      if (rfp.status === "questions_ready") await db.update(rfps).set({ status: "drafting" }).where(eq(rfps.id, rfpId));
      const brand = await getActiveBrand(rfp.workspaceId);
      return { workspaceId: rfp.workspaceId, contextSummary: rfp.contextSummary, voiceGuide: brand.voiceGuide };
    });

    const results: DraftOneResult[] = [];
    for (const batch of chunk(questionIds, PARALLEL)) {
      const settled = await Promise.all(
        batch.map((questionId) =>
          step.run(`draft-${questionId}`, async (): Promise<DraftOneResult> => {
            try {
              const r = await draftOne({ ...ctx, rfpId, questionId, instruction: instruction ?? null, actorId });
              await bumpJobProgress(jobId);
              return { questionId, ok: true, compliance: r.compliance, confidence: r.confidence };
            } catch (err) {
              await bumpJobProgress(jobId);
              const message = err instanceof Error ? err.message : String(err);
              console.error(`[draft] ${questionId} failed: ${message}`);
              return { questionId, ok: false, error: message.slice(0, 300) };
            }
          }),
        ),
      );
      results.push(...settled);
    }

    await step.run("finish", async () => {
      const failed = results.filter((r) => !r.ok);
      const [rfp] = await db.select({ status: rfps.status }).from(rfps).where(eq(rfps.id, rfpId)).limit(1);
      if (rfp && rfp.status === "drafting") await db.update(rfps).set({ status: "in_review" }).where(eq(rfps.id, rfpId));
      const allFailed = failed.length > 0 && failed.length === results.length;
      await finishJob(
        jobId,
        allFailed ? "failed" : "done",
        failed.length ? `${failed.length} of ${results.length} question${results.length === 1 ? "" : "s"} could not be drafted: ${failed[0].error}` : undefined,
      );
    });

    return { drafted: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
  },
);

async function draftOne(input: {
  workspaceId: string;
  rfpId: string;
  questionId: string;
  contextSummary: string | null;
  voiceGuide: string;
  instruction: string | null;
  actorId: string;
}) {
  const [q] = await db
    .select()
    .from(rfpQuestions)
    .where(and(eq(rfpQuestions.id, input.questionId), eq(rfpQuestions.rfpId, input.rfpId)))
    .limit(1);
  if (!q) throw new Error("question not found");

  // Embed once; the vector is stored so re-drafts and the workspace's "similar questions" reuse it.
  const embedding = q.embedding ?? (await embedQuery(questionEmbedText(q)));
  if (!q.embedding) await db.update(rfpQuestions).set({ embedding }).where(eq(rfpQuestions.id, q.id));

  const [entries, answers] = await Promise.all([
    retrieveEntries(input.workspaceId, embedding, { owner: q.owner, module: q.moduleHint, k: 8 }),
    retrieveApprovedAnswers(input.workspaceId, embedding, 5),
  ]);
  const passages = numberPassages(
    entries.map<Passage>((e) => ({
      id: e.id,
      kind: "kb_entry",
      label: `${e.product} · ${e.module.replace(/_/g, " ")} · ${e.featureName} (${e.availability})`,
      text: e.body,
      similarity: e.similarity,
    })),
    answers.map<Passage>((a) => ({
      id: a.id,
      kind: "approved_answer",
      label: `Approved answer from an earlier RFP · ${a.module.replace(/_/g, " ")}: "${a.canonicalQuestion}"`,
      text: a.canonicalAnswer,
      similarity: a.similarity,
    })),
  );

  const [existing] = await db.select().from(responses).where(eq(responses.questionId, q.id)).limit(1);
  const previous = existing?.currentRevisionId
    ? (await db.select({ finalText: responseRevisions.finalText }).from(responseRevisions).where(eq(responseRevisions.id, existing.currentRevisionId)).limit(1))[0]
    : null;

  const { draft, usage, model } = await draftResponse({
    voiceGuide: input.voiceGuide,
    contextSummary: input.contextSummary,
    question: q,
    passages,
    instruction: input.instruction,
    previousDraft: input.instruction ? (previous?.finalText ?? null) : null,
  });

  await db.transaction(async (tx) => {
    let responseId = existing?.id;
    if (!responseId) {
      // Two overlapping drafts of one question converge on the same response row.
      const [created] = await tx
        .insert(responses)
        .values({ questionId: q.id, status: "ai_draft", compliance: draft.compliance, confidence: draft.confidence.toFixed(3) })
        .onConflictDoNothing({ target: responses.questionId })
        .returning({ id: responses.id });
      responseId = created?.id ?? (await tx.select({ id: responses.id }).from(responses).where(eq(responses.questionId, q.id)).limit(1))[0]?.id;
      if (!responseId) throw new Error("response row vanished mid-draft");
    }
    const [{ version }] = await tx
      .select({ version: responseRevisions.version })
      .from(responseRevisions)
      .where(eq(responseRevisions.responseId, responseId))
      .orderBy(desc(responseRevisions.version))
      .limit(1)
      .then((rows) => (rows.length ? rows : [{ version: 0 }]));

    const [revision] = await tx
      .insert(responseRevisions)
      .values({
        responseId,
        version: version + 1,
        draftText: draft.draft_text,
        finalText: draft.draft_text,
        generatedBy: "model",
        authorId: input.instruction ? input.actorId : null,
        model,
        promptVersion: DRAFT_PROMPT_VERSION,
        instruction: input.instruction,
        openPoints: draft.open_points,
        usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cacheReadTokens: usage.cacheReadTokens, cacheWriteTokens: usage.cacheWriteTokens },
      })
      .returning({ id: responseRevisions.id });

    if (draft.citations.length) {
      await tx.insert(responseCitations).values(
        draft.citations.map((c) => {
          const p = passages.find((x) => x.n === c.n)!;
          return {
            revisionId: revision.id,
            ordinal: c.n,
            sourceType: p.kind,
            sourceId: p.id,
            similarity: p.similarity !== undefined ? p.similarity.toFixed(4) : null,
            excerpt: p.text.slice(0, 400),
            reason: c.why,
          };
        }),
      );
    }

    await tx
      .update(responses)
      .set({ currentRevisionId: revision.id, status: "ai_draft", compliance: draft.compliance, confidence: draft.confidence.toFixed(3) })
      .where(eq(responses.id, responseId));

    // The flywheel's scoreboard: an approved answer counts as reused when the draft actually cites it, not merely when retrieval offered it.
    const citedAnswerIds = [...new Set(draft.citations.map((c) => passages.find((x) => x.n === c.n)!).filter((p) => p.kind === "approved_answer").map((p) => p.id))];
    if (citedAnswerIds.length) {
      await tx
        .update(approvedAnswers)
        .set({ reuseCount: sql`${approvedAnswers.reuseCount} + 1`, lastUsedAt: new Date() })
        .where(inArray(approvedAnswers.id, citedAnswerIds));
    }
  });

  return { compliance: draft.compliance, confidence: draft.confidence };
}
