import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { approvedAnswers, clients, kbEntries, responseCitations, responseRevisions, responses, rfpQuestions, rfps } from "@/db/schema";
import type { CitationSource, Compliance, Generator, ResponseStatus, RfpStatus } from "@/domain/enums";
import { isUuid } from "@/domain/ids";
import { QUICK_CLIENT_NAME } from "@/domain/quick";

/**
 * Quick Q&A reads. A session is an `rfps` row with kind = quick; everything
 * here is workspace-scoped through that row.
 */

export interface QuickSessionRow {
  id: string;
  title: string;
  status: RfpStatus;
  clientName: string;
  isQuickClient: boolean;
  createdAt: Date;
  updatedAt: Date;
  questionCount: number;
  draftedCount: number;
  approvedCount: number;
  inKbCount: number;
}

/** Every quick session in the workspace, newest first, with its counts. */
export async function listQuickSessions(workspaceId: string): Promise<QuickSessionRow[]> {
  const sessions = await db
    .select({ id: rfps.id, title: rfps.title, status: rfps.status, clientName: clients.name, createdAt: rfps.createdAt, updatedAt: rfps.updatedAt })
    .from(rfps)
    .innerJoin(clients, eq(rfps.clientId, clients.id))
    .where(and(eq(rfps.workspaceId, workspaceId), eq(rfps.kind, "quick")))
    .orderBy(desc(rfps.createdAt));
  if (!sessions.length) return [];

  const counts = await db
    .select({
      rfpId: rfpQuestions.rfpId,
      questionCount: sql<number>`count(distinct ${rfpQuestions.id})`.mapWith(Number),
      draftedCount: sql<number>`count(distinct ${responses.id})`.mapWith(Number),
      approvedCount: sql<number>`count(distinct ${responses.id}) filter (where ${responses.status} = 'approved')`.mapWith(Number),
      inKbCount: sql<number>`count(distinct ${approvedAnswers.id})`.mapWith(Number),
    })
    .from(rfpQuestions)
    .leftJoin(responses, eq(responses.questionId, rfpQuestions.id))
    .leftJoin(approvedAnswers, eq(approvedAnswers.originResponseId, responses.id))
    .where(
      inArray(
        rfpQuestions.rfpId,
        sessions.map((s) => s.id),
      ),
    )
    .groupBy(rfpQuestions.rfpId);
  const byRfp = new Map(counts.map((c) => [c.rfpId, c]));

  return sessions.map((s) => {
    const c = byRfp.get(s.id);
    return { ...s, isQuickClient: s.clientName === QUICK_CLIENT_NAME, questionCount: c?.questionCount ?? 0, draftedCount: c?.draftedCount ?? 0, approvedCount: c?.approvedCount ?? 0, inKbCount: c?.inKbCount ?? 0 };
  });
}

export interface QuickSession {
  id: string;
  title: string;
  status: RfpStatus;
  context: string | null;
  clientId: string;
  clientName: string;
  isQuickClient: boolean;
  createdAt: Date;
}

/** One session's header. Null when it is not in the workspace or not a quick session. */
export async function getQuickSession(workspaceId: string, rfpId: string): Promise<QuickSession | null> {
  if (!isUuid(rfpId)) return null;
  const [row] = await db
    .select({ id: rfps.id, title: rfps.title, status: rfps.status, context: rfps.contextSummary, clientId: rfps.clientId, clientName: clients.name, createdAt: rfps.createdAt })
    .from(rfps)
    .innerJoin(clients, eq(rfps.clientId, clients.id))
    .where(and(eq(rfps.id, rfpId), eq(rfps.workspaceId, workspaceId), eq(rfps.kind, "quick")))
    .limit(1);
  return row ? { ...row, isQuickClient: row.clientName === QUICK_CLIENT_NAME } : null;
}

export interface QuickRow {
  questionId: string;
  refNo: string;
  questionText: string;
  sortOrder: number;
  responseId: string | null;
  status: ResponseStatus | null;
  compliance: Compliance | null;
  confidence: number | null;
  flagReason: string | null;
  revisionId: string | null;
  finalText: string | null;
  generatedBy: Generator | null;
  version: number | null;
  model: string | null;
  instruction: string | null;
  revisionAt: Date | null;
  openPoints: string[];
  citations: Array<{ ordinal: number; sourceType: CitationSource; title: string | null }>;
  kbAnswerId: string | null;
  /** A "Draft this question" job still queued or running, so the card shows progress after a reload. */
  draftJobId: string | null;
}

/** Every question with its current answer in full, its sources and whether it is already a precedent. Null when the RFP is not in the workspace. */
export async function listQuickRows(workspaceId: string, rfpId: string): Promise<QuickRow[] | null> {
  if (!isUuid(rfpId)) return null;
  const [owned] = await db.select({ id: rfps.id }).from(rfps).where(and(eq(rfps.id, rfpId), eq(rfps.workspaceId, workspaceId))).limit(1);
  if (!owned) return null;

  const rows = await db
    .select({
      questionId: rfpQuestions.id,
      refNo: rfpQuestions.refNo,
      questionText: rfpQuestions.questionText,
      sortOrder: rfpQuestions.sortOrder,
      responseId: responses.id,
      status: responses.status,
      compliance: responses.compliance,
      confidence: responses.confidence,
      flagReason: responses.flagReason,
      revisionId: responses.currentRevisionId,
      finalText: responseRevisions.finalText,
      generatedBy: responseRevisions.generatedBy,
      version: responseRevisions.version,
      model: responseRevisions.model,
      instruction: responseRevisions.instruction,
      revisionAt: responseRevisions.createdAt,
      openPoints: responseRevisions.openPoints,
      draftJobId: sql<string | null>`(select g.id from generation_jobs g where g.rfp_id = ${rfpQuestions.rfpId} and g.dedupe_key = 'draft:q:' || ${rfpQuestions.id}::text and g.status in ('queued', 'running') order by g.created_at desc limit 1)`,
    })
    .from(rfpQuestions)
    .leftJoin(responses, eq(responses.questionId, rfpQuestions.id))
    .leftJoin(responseRevisions, eq(responseRevisions.id, responses.currentRevisionId))
    .where(eq(rfpQuestions.rfpId, rfpId))
    .orderBy(asc(rfpQuestions.sortOrder));

  const revisionIds = rows.map((r) => r.revisionId).filter((id): id is string => !!id);
  const responseIds = rows.map((r) => r.responseId).filter((id): id is string => !!id);
  const [cites, promoted] = await Promise.all([
    revisionIds.length
      ? db
          .select({ revisionId: responseCitations.revisionId, ordinal: responseCitations.ordinal, sourceType: responseCitations.sourceType, entryTitle: kbEntries.featureName, answerTitle: approvedAnswers.canonicalQuestion })
          .from(responseCitations)
          .leftJoin(kbEntries, eq(kbEntries.id, responseCitations.sourceId))
          .leftJoin(approvedAnswers, eq(approvedAnswers.id, responseCitations.sourceId))
          .where(inArray(responseCitations.revisionId, revisionIds))
      : Promise.resolve([]),
    responseIds.length ? db.select({ id: approvedAnswers.id, originResponseId: approvedAnswers.originResponseId }).from(approvedAnswers).where(inArray(approvedAnswers.originResponseId, responseIds)) : Promise.resolve([]),
  ]);
  const kbByResponse = new Map(promoted.map((p) => [p.originResponseId, p.id]));

  return rows.map((r) => ({
    ...r,
    confidence: r.confidence === null ? null : Number(r.confidence),
    openPoints: r.openPoints ?? [],
    citations: cites
      .filter((c) => c.revisionId === r.revisionId)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((c) => ({ ordinal: c.ordinal, sourceType: c.sourceType, title: c.entryTitle ?? c.answerTitle ?? null })),
    kbAnswerId: r.responseId ? (kbByResponse.get(r.responseId) ?? null) : null,
  }));
}

/** The per-workspace client quick sessions are filed under when none is chosen; created on first use. */
export async function ensureQuickClient(workspaceId: string): Promise<string> {
  const [existing] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.workspaceId, workspaceId), eq(clients.name, QUICK_CLIENT_NAME))).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(clients).values({ workspaceId, name: QUICK_CLIENT_NAME, notes: "Sessions started from Quick Q&A without a client." }).returning({ id: clients.id });
  return created.id;
}

/** A client id that belongs to the workspace, or null. */
export async function ownedClientId(workspaceId: string, clientId: string): Promise<string | null> {
  if (!isUuid(clientId)) return null;
  const [row] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId))).limit(1);
  return row?.id ?? null;
}
