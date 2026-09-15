
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { rfpQuestions, rfpSections, rfps } from "@/db/schema";
import type { Module, Owner, QuestionType } from "@/domain/enums";

export interface SetupQuestionRow {
  id: string;
  sectionId: string | null;
  sectionTitle: string | null;
  refNo: string;
  questionText: string;
  acceptanceCriteria: string | null;
  questionType: QuestionType;
  isMandatory: boolean;
  owner: Owner;
  moduleHint: Module;
  rawMeta: Record<string, string>;
  existingAnswer: { compliance: string | null; answer: string | null; questions: string | null } | null;
  sourceRow: number | null;
  sortOrder: number;
}

export interface SectionRow {
  id: string;
  title: string;
  refCode: string | null;
  sortOrder: number;
}

/** Everything the extraction-review table needs, in sheet order. Workspace-scoped through the RFP. */
export async function listQuestionsForSetup(workspaceId: string, rfpId: string) {
  const [owned] = await db
    .select({ id: rfps.id })
    .from(rfps)
    .where(and(eq(rfps.id, rfpId), eq(rfps.workspaceId, workspaceId)))
    .limit(1);
  if (!owned) return null;

  const [sections, questions] = await Promise.all([
    db
      .select({ id: rfpSections.id, title: rfpSections.title, refCode: rfpSections.refCode, sortOrder: rfpSections.sortOrder })
      .from(rfpSections)
      .where(eq(rfpSections.rfpId, rfpId))
      .orderBy(asc(rfpSections.sortOrder)),
    db
      .select({
        id: rfpQuestions.id,
        sectionId: rfpQuestions.sectionId,
        sectionTitle: rfpSections.title,
        refNo: rfpQuestions.refNo,
        questionText: rfpQuestions.questionText,
        acceptanceCriteria: rfpQuestions.acceptanceCriteria,
        questionType: rfpQuestions.questionType,
        isMandatory: rfpQuestions.isMandatory,
        owner: rfpQuestions.owner,
        moduleHint: rfpQuestions.moduleHint,
        rawMeta: rfpQuestions.rawMeta,
        existingAnswer: rfpQuestions.existingAnswer,
        sourceRow: rfpQuestions.sourceRow,
        sortOrder: rfpQuestions.sortOrder,
      })
      .from(rfpQuestions)
      .leftJoin(rfpSections, eq(rfpQuestions.sectionId, rfpSections.id))
      .where(eq(rfpQuestions.rfpId, rfpId))
      .orderBy(asc(rfpQuestions.sortOrder)),
  ]);

  return { sections: sections as SectionRow[], questions: questions as SetupQuestionRow[] };
}
