import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { rfpQuestions, rfpSections, rfps } from "@/db/schema";
import { chunk, chunkPages, type ExtractedQuestion } from "@/domain/extraction";
import { resolveColumns } from "@/engine/columns";
import { extractFromPages, extractFromSheet } from "@/engine/extract";
import type { ParsedDocument } from "@/lib/parsing";

/**
 * What the extract job and the Quick Q&A intake share: turning one parsed
 * document into questions, and writing questions + sections for an RFP.
 */

export const ROWS_PER_CHUNK = 40;
export const MIN_ROWS_FOR_A_SHEET = 3;

/** How many model calls a document costs — the job's progress total. */
export function countChunks(doc: ParsedDocument): number {
  return doc.kind === "xlsx"
    ? (doc.sheets ?? []).filter((s) => s.rows.length >= MIN_ROWS_FOR_A_SHEET).reduce((n, s) => n + chunk(s.rows, ROWS_PER_CHUNK).length, 0)
    : chunkPages(doc.pages ?? [], 6_000).length;
}

export interface DocumentExtraction {
  questions: ExtractedQuestion[];
  sections: string[];
  /** The narrative text, for the brief; empty for spreadsheets. */
  narrative: string;
}

export async function extractParsedDocument(parsed: ParsedDocument, opts: { knownSections: string[]; onProgress?: () => void | Promise<void> }): Promise<DocumentExtraction> {
  const questions: ExtractedQuestion[] = [];
  let sections = [...opts.knownSections];
  let narrative = "";

  if (parsed.kind === "xlsx") {
    for (const sheet of (parsed.sheets ?? []).filter((s) => s.rows.length >= MIN_ROWS_FOR_A_SHEET)) {
      const cols = await resolveColumns(sheet);
      if (!cols.map.hasQuestion) continue;
      const r = await extractFromSheet(sheet, cols.map, { knownSections: sections, onProgress: opts.onProgress });
      questions.push(...r.questions);
      sections = r.sections;
    }
  } else {
    narrative = parsed.text;
    const r = await extractFromPages(parsed.pages ?? [], { knownSections: sections, onProgress: opts.onProgress });
    questions.push(...r.questions);
    sections = r.sections;
  }
  return { questions, sections, narrative };
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Replace the RFP's sections and questions with the extraction result; refs are re-numbered across documents so they stay unique. */
export async function persistExtractedQuestions(tx: Tx, rfpId: string, all: ReadonlyArray<ExtractedQuestion & { documentId: string | null }>, knownSections: readonly string[]): Promise<{ questions: number; sections: number; withExisting: number }> {
  const [owner] = await tx.select({ workspaceId: rfps.workspaceId }).from(rfps).where(eq(rfps.id, rfpId)).limit(1);
  if (!owner) throw new Error("rfp vanished");
  await tx.delete(rfpQuestions).where(eq(rfpQuestions.rfpId, rfpId));
  await tx.delete(rfpSections).where(eq(rfpSections.rfpId, rfpId));

  const sectionIds = new Map<string, string>();
  for (const [i, title] of knownSections.entries()) {
    const [s] = await tx.insert(rfpSections).values({ rfpId, title, sortOrder: i }).returning({ id: rfpSections.id });
    sectionIds.set(title.toLowerCase(), s.id);
  }
  const seen = new Set<string>();
  const rows = all.map((q, i) => {
    let refNo = q.refNo;
    if (seen.has(refNo)) refNo = `${refNo}·${i + 1}`;
    seen.add(refNo);
    return {
      rfpId,
      workspaceId: owner.workspaceId,
      sectionId: sectionIds.get(q.sectionTitle.toLowerCase()) ?? null,
      refNo,
      questionText: q.questionText,
      acceptanceCriteria: q.acceptanceCriteria,
      questionType: q.questionType,
      isMandatory: q.isMandatory,
      owner: q.owner,
      moduleHint: q.moduleHint,
      rawMeta: q.rawMeta,
      existingAnswer: q.existing && (q.existing.answer || q.existing.compliance || q.existing.questions) ? q.existing : null,
      sourceDocumentId: q.documentId,
      sourceRow: q.sourceRow ?? q.sourcePage,
      sortOrder: i,
    };
  });
  for (const batch of chunk(rows, 200)) await tx.insert(rfpQuestions).values(batch);
  return { questions: rows.length, sections: knownSections.length, withExisting: rows.filter((r) => r.existingAnswer).length };
}
