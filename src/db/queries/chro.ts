import { and, asc, eq } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { chroQuestions, clients, responseRevisions, responses, rfpQuestions, rfps } from "@/db/schema";
import { sortChroRows, type ChroSourceRow } from "@/domain/chro";
import { isUuid } from "@/domain/ids";
import type { ChroStatus, ChroTheme } from "@/domain/enums";

export interface ChroRow {
  id: string;
  theme: ChroTheme;
  questionText: string;
  rationale: string;
  sortOrder: number;
  status: ChroStatus;
  createdAt: Date;
}

/** The curated list, in theme order. Null when the RFP is not in the workspace. */
export async function listChroQuestions(workspaceId: string, rfpId: string): Promise<ChroRow[] | null> {
  if (!isUuid(rfpId)) return null;
  const [owned] = await db.select({ id: rfps.id }).from(rfps).where(and(eq(rfps.id, rfpId), eq(rfps.workspaceId, workspaceId))).limit(1);
  if (!owned) return null;
  const rows = await db
    .select({ id: chroQuestions.id, theme: chroQuestions.theme, questionText: chroQuestions.questionText, rationale: chroQuestions.rationale, sortOrder: chroQuestions.sortOrder, status: chroQuestions.status, createdAt: chroQuestions.createdAt })
    .from(chroQuestions)
    .where(eq(chroQuestions.rfpId, rfpId))
    .orderBy(asc(chroQuestions.sortOrder));
  return sortChroRows(rows);
}

/** Every question with its current answer in full — the workspace's 240-char preview is not enough here. */
export async function getChroSourceRows(rfpId: string, executor: Executor = db): Promise<ChroSourceRow[]> {
  const rows = await executor
    .select({
      refNo: rfpQuestions.refNo,
      questionText: rfpQuestions.questionText,
      status: responses.status,
      compliance: responses.compliance,
      answerText: responseRevisions.finalText,
      openPoints: responseRevisions.openPoints,
    })
    .from(rfpQuestions)
    .leftJoin(responses, eq(responses.questionId, rfpQuestions.id))
    .leftJoin(responseRevisions, eq(responseRevisions.id, responses.currentRevisionId))
    .where(eq(rfpQuestions.rfpId, rfpId))
    .orderBy(asc(rfpQuestions.sortOrder));
  return rows.map((r) => ({ ...r, openPoints: r.openPoints ?? [] }));
}

/** Client and RFP facts the prompt opens with; the same profile the brief was written from. */
export async function getChroClientContext(rfpId: string, executor: Executor = db) {
  const [row] = await executor
    .select({
      workspaceId: rfps.workspaceId,
      rfpTitle: rfps.title,
      engagementType: rfps.engagementType,
      contextSummary: rfps.contextSummary,
      clientName: clients.name,
      industry: clients.industry,
      headcount: clients.headcount,
      hqCountry: clients.hqCountry,
      countriesCount: clients.countriesCount,
      currentHrms: clients.currentHrms,
      groupStructure: clients.groupStructure,
      notes: clients.notes,
    })
    .from(rfps)
    .innerJoin(clients, eq(rfps.clientId, clients.id))
    .where(eq(rfps.id, rfpId))
    .limit(1);
  if (!row) return null;
  const { workspaceId, rfpTitle, engagementType, contextSummary, clientName, ...profile } = row;
  return { workspaceId, rfpTitle, engagementType, contextSummary, clientName, clientProfile: profile as Record<string, unknown> };
}
