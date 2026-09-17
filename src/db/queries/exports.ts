import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { approvedAnswers, brandTemplates, chroQuestions, clients, exports as exportsTable, kbEntries, responseCitations, responseRevisions, responses, rfpDocuments, rfpQuestions, rfpSections, rfps, user } from "@/db/schema";
import type { DocumentKind, ExportFormat, JobStatus, ResponseStatus } from "@/domain/enums";
import type { ExportOptions, ExportSource } from "@/domain/export";
import { isUuid } from "@/domain/ids";

/**
 * Exports: the job-side read of everything a file needs, and the workspace-
 * scoped history the page shows. Blob I/O (the parsed workbook JSON, the
 * original upload) is the job's business, not this file's.
 */

export interface ExportSourceDocument {
  id: string;
  kind: DocumentKind;
  fileName: string;
  fileUrl: string;
  parsedTextUrl: string | null;
  createdAt: Date;
}

export type ExportSourceRows = Omit<ExportSource, "sheets" | "generatedAt"> & {
  workspaceId: string;
  documents: ExportSourceDocument[];
};

/** Every question with its current answer in full, citations with titles, kept CHRO questions and the parsed documents. Unscoped: callers are jobs. */
export async function getExportSource(rfpId: string, executor: Executor = db): Promise<ExportSourceRows | null> {
  if (!isUuid(rfpId)) return null;
  const [head] = await executor
    .select({
      id: rfps.id,
      workspaceId: rfps.workspaceId,
      title: rfps.title,
      engagementType: rfps.engagementType,
      bidderOfRecord: rfps.bidderOfRecord,
      status: rfps.status,
      dueDate: rfps.dueDate,
      contextSummary: rfps.contextSummary,
      clientName: clients.name,
      industry: clients.industry,
      hqCountry: clients.hqCountry,
      headcount: clients.headcount,
      currentHrms: clients.currentHrms,
    })
    .from(rfps)
    .innerJoin(clients, eq(rfps.clientId, clients.id))
    .where(eq(rfps.id, rfpId))
    .limit(1);
  if (!head) return null;

  const [sections, questions, chro, documents] = await Promise.all([
    executor.select({ id: rfpSections.id, title: rfpSections.title, sortOrder: rfpSections.sortOrder }).from(rfpSections).where(eq(rfpSections.rfpId, rfpId)).orderBy(asc(rfpSections.sortOrder)),
    executor
      .select({
        id: rfpQuestions.id,
        refNo: rfpQuestions.refNo,
        questionText: rfpQuestions.questionText,
        acceptanceCriteria: rfpQuestions.acceptanceCriteria,
        questionType: rfpQuestions.questionType,
        isMandatory: rfpQuestions.isMandatory,
        owner: rfpQuestions.owner,
        moduleHint: rfpQuestions.moduleHint,
        rawMeta: rfpQuestions.rawMeta,
        sortOrder: rfpQuestions.sortOrder,
        sectionId: rfpQuestions.sectionId,
        sourceDocumentId: rfpQuestions.sourceDocumentId,
        sourceRow: rfpQuestions.sourceRow,
        status: responses.status,
        compliance: responses.compliance,
        flagReason: responses.flagReason,
        answerText: responseRevisions.finalText,
        openPoints: responseRevisions.openPoints,
        revisionId: responses.currentRevisionId,
      })
      .from(rfpQuestions)
      .leftJoin(responses, eq(responses.questionId, rfpQuestions.id))
      .leftJoin(responseRevisions, eq(responseRevisions.id, responses.currentRevisionId))
      .where(eq(rfpQuestions.rfpId, rfpId))
      .orderBy(asc(rfpQuestions.sortOrder)),
    executor
      .select({ id: chroQuestions.id, theme: chroQuestions.theme, questionText: chroQuestions.questionText, rationale: chroQuestions.rationale, sortOrder: chroQuestions.sortOrder, status: chroQuestions.status, createdAt: chroQuestions.createdAt })
      .from(chroQuestions)
      .where(and(eq(chroQuestions.rfpId, rfpId), eq(chroQuestions.status, "kept"))),
    executor
      .select({ id: rfpDocuments.id, kind: rfpDocuments.kind, fileName: rfpDocuments.fileName, fileUrl: rfpDocuments.fileUrl, parsedTextUrl: rfpDocuments.parsedTextUrl, createdAt: rfpDocuments.createdAt })
      .from(rfpDocuments)
      .where(and(eq(rfpDocuments.rfpId, rfpId), inArray(rfpDocuments.kind, ["rfp_main", "appendix"]), eq(rfpDocuments.parseStatus, "parsed")))
      .orderBy(asc(rfpDocuments.createdAt)),
  ]);

  const revisionIds = questions.map((q) => q.revisionId).filter((id): id is string => !!id);
  const citations = revisionIds.length
    ? await executor
        .select({
          revisionId: responseCitations.revisionId,
          ordinal: responseCitations.ordinal,
          sourceType: responseCitations.sourceType,
          excerpt: responseCitations.excerpt,
          entryTitle: kbEntries.featureName,
          answerTitle: approvedAnswers.canonicalQuestion,
        })
        .from(responseCitations)
        .leftJoin(kbEntries, eq(kbEntries.id, responseCitations.sourceId))
        .leftJoin(approvedAnswers, eq(approvedAnswers.id, responseCitations.sourceId))
        .where(inArray(responseCitations.revisionId, revisionIds))
    : [];

  const { workspaceId, clientName, industry, hqCountry, headcount, currentHrms, ...rfp } = head;
  return {
    workspaceId,
    rfp,
    client: { name: clientName, industry, hqCountry, headcount, currentHrms },
    sections,
    questions: questions.map((q) => ({ ...q, rawMeta: q.rawMeta ?? {}, openPoints: q.openPoints ?? [] })),
    citations: citations.map((c) => ({ revisionId: c.revisionId, ordinal: c.ordinal, sourceType: c.sourceType, title: c.entryTitle ?? c.answerTitle ?? null, excerpt: c.excerpt })),
    chro,
    // rfp_main first, then appendices, each oldest first — the order the client's sheets are searched.
    documents: [...documents].sort((a, b) => (a.kind === b.kind ? a.createdAt.getTime() - b.createdAt.getTime() : a.kind === "rfp_main" ? -1 : 1)),
  };
}

/** The client's spreadsheet a "fill" export writes back into: the oldest parsed main-RFP .xlsx. */
export function pickWorkbook(documents: readonly ExportSourceDocument[]): ExportSourceDocument | null {
  return documents.find((d) => d.kind === "rfp_main" && d.parsedTextUrl && /\.xlsx$/i.test(d.fileName)) ?? null;
}

export async function hasFillableWorkbook(rfpId: string): Promise<boolean> {
  const source = await getExportSource(rfpId);
  return !!source && pickWorkbook(source.documents) !== null;
}

/** Status per question, for the readiness band. Null when the RFP is not in the workspace. */
export async function getExportReadinessRows(workspaceId: string, rfpId: string): Promise<Array<{ status: ResponseStatus | null }> | null> {
  if (!isUuid(rfpId)) return null;
  const [owned] = await db.select({ id: rfps.id }).from(rfps).where(and(eq(rfps.id, rfpId), eq(rfps.workspaceId, workspaceId))).limit(1);
  if (!owned) return null;
  return db.select({ status: responses.status }).from(rfpQuestions).leftJoin(responses, eq(responses.questionId, rfpQuestions.id)).where(eq(rfpQuestions.rfpId, rfpId));
}

export interface ExportRow {
  id: string;
  rfpId: string;
  format: ExportFormat;
  status: JobStatus;
  jobId: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  error: string | null;
  options: ExportOptions;
  summary: string | null;
  createdByName: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

const exportColumns = {
  id: exportsTable.id,
  rfpId: exportsTable.rfpId,
  format: exportsTable.format,
  status: exportsTable.status,
  jobId: exportsTable.jobId,
  fileName: exportsTable.fileName,
  sizeBytes: exportsTable.sizeBytes,
  error: exportsTable.error,
  options: exportsTable.options,
  summary: exportsTable.summary,
  createdByName: user.name,
  createdAt: exportsTable.createdAt,
  finishedAt: exportsTable.finishedAt,
};

type RawExportRow = Omit<ExportRow, "options"> & { options: Record<string, unknown> | null };

function toRow(r: RawExportRow): ExportRow {
  return { ...r, options: (r.options ?? {}) as ExportOptions };
}

/** The RFP's export history, newest first. Null when the RFP is not in the workspace. */
export async function listExports(workspaceId: string, rfpId: string): Promise<ExportRow[] | null> {
  if (!isUuid(rfpId)) return null;
  const [owned] = await db.select({ id: rfps.id }).from(rfps).where(and(eq(rfps.id, rfpId), eq(rfps.workspaceId, workspaceId))).limit(1);
  if (!owned) return null;
  const rows = await db.select(exportColumns).from(exportsTable).leftJoin(user, eq(user.id, exportsTable.createdBy)).where(eq(exportsTable.rfpId, rfpId)).orderBy(desc(exportsTable.createdAt)).limit(50);
  return rows.map(toRow);
}

export async function getExport(workspaceId: string, exportId: string, executor: Executor = db): Promise<(ExportRow & { fileUrl: string | null }) | null> {
  if (!isUuid(exportId)) return null;
  const [row] = await executor
    .select({ ...exportColumns, fileUrl: exportsTable.fileUrl })
    .from(exportsTable)
    .innerJoin(rfps, and(eq(rfps.id, exportsTable.rfpId), eq(rfps.workspaceId, workspaceId)))
    .leftJoin(user, eq(user.id, exportsTable.createdBy))
    .where(eq(exportsTable.id, exportId))
    .limit(1);
  if (!row) return null;
  const { fileUrl, ...rest } = row;
  return { ...toRow(rest), fileUrl };
}

export async function activeBrandTemplateId(workspaceId: string): Promise<string | null> {
  const [row] = await db.select({ id: brandTemplates.id }).from(brandTemplates).where(and(eq(brandTemplates.workspaceId, workspaceId), eq(brandTemplates.isActive, true))).limit(1);
  return row?.id ?? null;
}

export async function createExportRow(input: { rfpId: string; format: ExportFormat; brandTemplateId: string | null; options: ExportOptions; createdBy: string }): Promise<string> {
  const [row] = await db
    .insert(exportsTable)
    .values({ rfpId: input.rfpId, format: input.format, brandTemplateId: input.brandTemplateId, options: input.options, createdBy: input.createdBy, status: "queued" })
    .returning({ id: exportsTable.id });
  return row.id;
}

export async function setExportJob(exportId: string, jobId: string): Promise<void> {
  await db.update(exportsTable).set({ jobId }).where(eq(exportsTable.id, exportId));
}

export async function markExportRunning(exportId: string): Promise<void> {
  await db.update(exportsTable).set({ status: "running", error: null }).where(eq(exportsTable.id, exportId));
}

export async function finishExportRow(exportId: string, result: { status: "done"; fileUrl: string; fileName: string; sizeBytes: number; summary?: string | null } | { status: "failed"; error: string }): Promise<void> {
  const patch =
    result.status === "done"
      ? { status: "done" as const, fileUrl: result.fileUrl, fileName: result.fileName, sizeBytes: result.sizeBytes, summary: result.summary ?? null, error: null, finishedAt: new Date() }
      : { status: "failed" as const, error: result.error.slice(0, 500), finishedAt: new Date() };
  await db.update(exportsTable).set(patch).where(eq(exportsTable.id, exportId));
}

/** The newest export of this format that is still queued or running. */
export async function activeExport(rfpId: string, format: ExportFormat): Promise<{ id: string; jobId: string | null; status: JobStatus; createdAt: Date } | null> {
  const [row] = await db
    .select({ id: exportsTable.id, jobId: exportsTable.jobId, status: exportsTable.status, createdAt: exportsTable.createdAt })
    .from(exportsTable)
    .where(and(eq(exportsTable.rfpId, rfpId), eq(exportsTable.format, format), inArray(exportsTable.status, ["queued", "running"])))
    .orderBy(desc(exportsTable.createdAt))
    .limit(1);
  return row ?? null;
}

export async function deleteExportRow(exportId: string): Promise<{ fileUrl: string | null } | null> {
  const [row] = await db.delete(exportsTable).where(eq(exportsTable.id, exportId)).returning({ fileUrl: exportsTable.fileUrl });
  return row ?? null;
}
