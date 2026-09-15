import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { approvedAnswers, kbEntries, responseCitations, responseRevisions, responses, rfpQuestions, rfpSections, rfps, user } from "@/db/schema";
import type { CitationSource, Compliance, Generator, Module, Owner, QuestionType, ResponseStatus } from "@/domain/enums";

/**
 * One row of the review grid: the question, its section, and the current
 * state of its response, flattened. The client's own columns travel along as
 * rawMeta so the grid can show them next to ours.
 */
export interface WorkspaceRow {
  questionId: string;
  refNo: string;
  sectionId: string | null;
  sectionTitle: string | null;
  questionText: string;
  acceptanceCriteria: string | null;
  questionType: QuestionType;
  isMandatory: boolean;
  owner: Owner;
  moduleHint: Module;
  rawMeta: Record<string, string>;
  sortOrder: number;
  responseId: string | null;
  status: ResponseStatus | null;
  compliance: Compliance | null;
  confidence: number | null;
  assigneeId: string | null;
  assigneeName: string | null;
  responsePreview: string | null;
  version: number | null;
  openPointCount: number;
}

export interface WorkspaceSection {
  id: string;
  title: string;
  sortOrder: number;
}

export async function getWorkspaceRows(workspaceId: string, rfpId: string): Promise<{ rows: WorkspaceRow[]; sections: WorkspaceSection[] } | null> {
  const [owned] = await db.select({ id: rfps.id }).from(rfps).where(and(eq(rfps.id, rfpId), eq(rfps.workspaceId, workspaceId))).limit(1);
  if (!owned) return null;

  const [sections, rows] = await Promise.all([
    db
      .select({ id: rfpSections.id, title: rfpSections.title, sortOrder: rfpSections.sortOrder })
      .from(rfpSections)
      .where(eq(rfpSections.rfpId, rfpId))
      .orderBy(asc(rfpSections.sortOrder)),
    db
      .select({
        questionId: rfpQuestions.id,
        refNo: rfpQuestions.refNo,
        sectionId: rfpQuestions.sectionId,
        sectionTitle: rfpSections.title,
        questionText: rfpQuestions.questionText,
        acceptanceCriteria: rfpQuestions.acceptanceCriteria,
        questionType: rfpQuestions.questionType,
        isMandatory: rfpQuestions.isMandatory,
        owner: rfpQuestions.owner,
        moduleHint: rfpQuestions.moduleHint,
        rawMeta: rfpQuestions.rawMeta,
        sortOrder: rfpQuestions.sortOrder,
        responseId: responses.id,
        status: responses.status,
        compliance: responses.compliance,
        confidence: responses.confidence,
        assigneeId: responses.assigneeId,
        assigneeName: user.name,
        finalText: responseRevisions.finalText,
        version: responseRevisions.version,
        openPoints: responseRevisions.openPoints,
      })
      .from(rfpQuestions)
      .leftJoin(rfpSections, eq(rfpQuestions.sectionId, rfpSections.id))
      .leftJoin(responses, eq(responses.questionId, rfpQuestions.id))
      .leftJoin(responseRevisions, eq(responseRevisions.id, responses.currentRevisionId))
      .leftJoin(user, eq(user.id, responses.assigneeId))
      .where(eq(rfpQuestions.rfpId, rfpId))
      .orderBy(asc(rfpQuestions.sortOrder)),
  ]);

  return {
    sections,
    rows: rows.map((r) => ({
      questionId: r.questionId,
      refNo: r.refNo,
      sectionId: r.sectionId,
      sectionTitle: r.sectionTitle,
      questionText: r.questionText,
      acceptanceCriteria: r.acceptanceCriteria,
      questionType: r.questionType,
      isMandatory: r.isMandatory,
      owner: r.owner,
      moduleHint: r.moduleHint,
      rawMeta: r.rawMeta,
      sortOrder: r.sortOrder,
      responseId: r.responseId,
      status: r.status,
      compliance: r.compliance,
      confidence: r.confidence === null ? null : Number(r.confidence),
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName,
      responsePreview: r.finalText ? r.finalText.slice(0, 240) : null,
      version: r.version,
      openPointCount: r.openPoints?.length ?? 0,
    })),
  };
}

export interface RevisionView {
  id: string;
  version: number;
  draftText: string;
  finalText: string;
  generatedBy: Generator;
  authorName: string | null;
  model: string | null;
  instruction: string | null;
  openPoints: string[];
  createdAt: Date;
  citations: Array<{
    id: string;
    ordinal: number;
    sourceType: CitationSource;
    sourceId: string;
    similarity: number | null;
    excerpt: string;
    reason: string | null;
    title: string | null;
  }>;
}

export interface QuestionDetail {
  questionId: string;
  refNo: string;
  questionText: string;
  acceptanceCriteria: string | null;
  rawMeta: Record<string, string>;
  response: {
    id: string;
    status: ResponseStatus;
    compliance: Compliance | null;
    confidence: number | null;
    currentRevisionId: string | null;
    flagReason: string | null;
    approvedAt: Date | null;
  } | null;
  revisions: RevisionView[];
}

/** Everything the context panel shows for one question: response, every revision, every citation. */
export async function getQuestionDetail(workspaceId: string, rfpId: string, questionId: string): Promise<QuestionDetail | null> {
  const [q] = await db
    .select({
      questionId: rfpQuestions.id,
      refNo: rfpQuestions.refNo,
      questionText: rfpQuestions.questionText,
      acceptanceCriteria: rfpQuestions.acceptanceCriteria,
      rawMeta: rfpQuestions.rawMeta,
    })
    .from(rfpQuestions)
    .innerJoin(rfps, eq(rfpQuestions.rfpId, rfps.id))
    .where(and(eq(rfpQuestions.id, questionId), eq(rfpQuestions.rfpId, rfpId), eq(rfps.workspaceId, workspaceId)))
    .limit(1);
  if (!q) return null;

  const [response] = await db
    .select({
      id: responses.id,
      status: responses.status,
      compliance: responses.compliance,
      confidence: responses.confidence,
      currentRevisionId: responses.currentRevisionId,
      flagReason: responses.flagReason,
      approvedAt: responses.approvedAt,
    })
    .from(responses)
    .where(eq(responses.questionId, questionId))
    .limit(1);

  let revisions: RevisionView[] = [];
  if (response) {
    const revs = await db
      .select({
        id: responseRevisions.id,
        version: responseRevisions.version,
        draftText: responseRevisions.draftText,
        finalText: responseRevisions.finalText,
        generatedBy: responseRevisions.generatedBy,
        authorName: user.name,
        model: responseRevisions.model,
        instruction: responseRevisions.instruction,
        openPoints: responseRevisions.openPoints,
        createdAt: responseRevisions.createdAt,
      })
      .from(responseRevisions)
      .leftJoin(user, eq(user.id, responseRevisions.authorId))
      .where(eq(responseRevisions.responseId, response.id))
      .orderBy(desc(responseRevisions.version));

    const cites = revs.length
      ? await db
          .select({
            id: responseCitations.id,
            revisionId: responseCitations.revisionId,
            ordinal: responseCitations.ordinal,
            sourceType: responseCitations.sourceType,
            sourceId: responseCitations.sourceId,
            similarity: responseCitations.similarity,
            excerpt: responseCitations.excerpt,
            reason: responseCitations.reason,
            entryTitle: kbEntries.featureName,
            answerTitle: approvedAnswers.canonicalQuestion,
          })
          .from(responseCitations)
          .leftJoin(kbEntries, eq(kbEntries.id, responseCitations.sourceId))
          .leftJoin(approvedAnswers, eq(approvedAnswers.id, responseCitations.sourceId))
          .where(
            inArray(
              responseCitations.revisionId,
              revs.map((r) => r.id),
            ),
          )
      : [];

    revisions = revs.map((r) => ({
      ...r,
      openPoints: r.openPoints ?? [],
      citations: cites
        .filter((c) => c.revisionId === r.id)
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((c) => ({
          id: c.id,
          ordinal: c.ordinal,
          sourceType: c.sourceType,
          sourceId: c.sourceId,
          similarity: c.similarity === null ? null : Number(c.similarity),
          excerpt: c.excerpt,
          reason: c.reason,
          title: c.entryTitle ?? c.answerTitle ?? null,
        })),
    }));
  }

  return {
    ...q,
    response: response ? { ...response, confidence: response.confidence === null ? null : Number(response.confidence) } : null,
    revisions,
  };
}
