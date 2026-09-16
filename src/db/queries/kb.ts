import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { approvedAnswers, kbEntries, kbSources, responses, rfps } from "@/db/schema";
import type { Availability, JobStatus, KbEntryType, KbSourceKind, Module, Owner } from "@/domain/enums";
import { isUuid } from "@/domain/ids";

export interface RetrievedEntry {
  id: string;
  entryType: KbEntryType;
  product: string;
  module: Module;
  featureName: string;
  body: string;
  availability: Availability;
  similarity: number;
}

export interface RetrievedAnswer {
  id: string;
  canonicalQuestion: string;
  canonicalAnswer: string;
  module: Module;
  similarity: number;
}

/** Which entry types a question's owner may cite. Joint questions see everything. */
function typesFor(owner: Owner): KbEntryType[] {
  if (owner === "darwinbox") return ["darwinbox_capability", "boilerplate"];
  if (owner === "kognoz") return ["kognoz_service", "case_study", "boilerplate"];
  return ["darwinbox_capability", "kognoz_service", "case_study", "boilerplate"];
}

function vectorParam(embedding: number[]) {
  return sql`${JSON.stringify(embedding)}::vector`;
}

/**
 * Top-k knowledge-base passages for a question. Cosine similarity, with a
 * small boost when the entry's module matches the question's, so a payroll
 * question prefers payroll entries without losing a strong general match.
 */
export async function retrieveEntries(
  workspaceId: string,
  embedding: number[],
  opts: { owner: Owner; module: Module; k?: number },
): Promise<RetrievedEntry[]> {
  const v = vectorParam(embedding);
  const similarity = sql<number>`1 - (${kbEntries.embedding} <=> ${v})`;
  const score = sql<number>`(1 - (${kbEntries.embedding} <=> ${v})) + (case when ${kbEntries.module} = ${opts.module} then 0.05 else 0 end)`;
  const rows = await db
    .select({
      id: kbEntries.id,
      entryType: kbEntries.entryType,
      product: kbEntries.product,
      module: kbEntries.module,
      featureName: kbEntries.featureName,
      body: kbEntries.body,
      availability: kbEntries.availability,
      similarity: similarity.mapWith(Number),
    })
    .from(kbEntries)
    .where(
      and(
        eq(kbEntries.workspaceId, workspaceId),
        eq(kbEntries.isActive, true),
        sql`${kbEntries.embedding} is not null`,
        sql`${kbEntries.entryType} in ${typesFor(opts.owner)}`,
      ),
    )
    .orderBy(sql`${score} desc`)
    .limit(opts.k ?? 8);
  return rows;
}

/** Top-k approved answers from earlier RFPs — the flywheel. Any module. */
export async function retrieveApprovedAnswers(workspaceId: string, embedding: number[], k = 5): Promise<RetrievedAnswer[]> {
  const v = vectorParam(embedding);
  const similarity = sql<number>`1 - (${approvedAnswers.embedding} <=> ${v})`;
  return db
    .select({
      id: approvedAnswers.id,
      canonicalQuestion: approvedAnswers.canonicalQuestion,
      canonicalAnswer: approvedAnswers.canonicalAnswer,
      module: approvedAnswers.module,
      similarity: similarity.mapWith(Number),
    })
    .from(approvedAnswers)
    .where(and(eq(approvedAnswers.workspaceId, workspaceId), sql`${approvedAnswers.embedding} is not null`))
    .orderBy(sql`${similarity} desc`)
    .limit(k);
}

export async function kbStats(workspaceId: string) {
  const [row] = (
    await db.execute(sql`
      select
        (select count(*)::int from kb_entries where workspace_id = ${workspaceId} and is_active) as entries,
        (select count(*)::int from kb_entries where workspace_id = ${workspaceId} and is_active and embedding is not null) as embedded,
        (select count(*)::int from approved_answers where workspace_id = ${workspaceId}) as answers
    `)
  ).rows as Array<{ entries: number; embedded: number; answers: number }>;
  return row;
}

// ---- Knowledge base screen ----

export interface KbEntryRow {
  id: string;
  entryType: KbEntryType;
  product: string;
  module: Module;
  featureName: string;
  body: string;
  availability: Availability;
  tags: string[];
  sourceId: string | null;
  sourceName: string | null;
  isActive: boolean;
  /** False until Voyage has embedded it; retrieval skips such rows. */
  embedded: boolean;
  updatedAt: Date;
}

const entryColumns = {
  id: kbEntries.id,
  entryType: kbEntries.entryType,
  product: kbEntries.product,
  module: kbEntries.module,
  featureName: kbEntries.featureName,
  body: kbEntries.body,
  availability: kbEntries.availability,
  tags: kbEntries.tags,
  sourceId: kbEntries.sourceId,
  sourceName: kbSources.name,
  isActive: kbEntries.isActive,
  embedded: sql<boolean>`${kbEntries.embedding} is not null`.mapWith(Boolean),
  updatedAt: kbEntries.updatedAt,
};

/** Escape the user's text for ILIKE: `%` and `_` are wildcards there. */
function likePattern(q: string): string {
  return `%${q.trim().replace(/[\\%_]/g, "\\$&")}%`;
}

export interface KbEntryFilters {
  types: readonly KbEntryType[];
  module?: Module | null;
  q?: string;
  sourceId?: string | null;
  includeInactive?: boolean;
}

/** Entries for one tab, filtered, in module then name order. Search covers name, body, product and tags. */
export async function listKbEntries(workspaceId: string, filters: KbEntryFilters): Promise<KbEntryRow[]> {
  if (!filters.types.length) return [];
  if (filters.sourceId && !isUuid(filters.sourceId)) return [];
  const pattern = filters.q?.trim() ? likePattern(filters.q) : null;
  return db
    .select(entryColumns)
    .from(kbEntries)
    .leftJoin(kbSources, eq(kbSources.id, kbEntries.sourceId))
    .where(
      and(
        eq(kbEntries.workspaceId, workspaceId),
        inArray(kbEntries.entryType, [...filters.types]),
        filters.module ? eq(kbEntries.module, filters.module) : undefined,
        filters.sourceId ? eq(kbEntries.sourceId, filters.sourceId) : undefined,
        filters.includeInactive ? undefined : eq(kbEntries.isActive, true),
        pattern
          ? or(
              ilike(kbEntries.featureName, pattern),
              ilike(kbEntries.body, pattern),
              ilike(kbEntries.product, pattern),
              sql`array_to_string(${kbEntries.tags}, ' ') ilike ${pattern}`,
            )
          : undefined,
      ),
    )
    .orderBy(asc(kbEntries.module), asc(kbEntries.featureName));
}

export async function getKbEntry(workspaceId: string, id: string): Promise<KbEntryRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select(entryColumns)
    .from(kbEntries)
    .leftJoin(kbSources, eq(kbSources.id, kbEntries.sourceId))
    .where(and(eq(kbEntries.workspaceId, workspaceId), eq(kbEntries.id, id)))
    .limit(1);
  return row ?? null;
}

/** Active counts per tab, for the tab strip. One round trip. */
export async function kbTabCounts(workspaceId: string): Promise<{ capabilities: number; services: number; answers: number; sources: number }> {
  const [row] = (
    await db.execute(sql`
      select
        (select count(*)::int from kb_entries where workspace_id = ${workspaceId} and is_active and entry_type = 'darwinbox_capability') as capabilities,
        (select count(*)::int from kb_entries where workspace_id = ${workspaceId} and is_active and entry_type <> 'darwinbox_capability') as services,
        (select count(*)::int from approved_answers where workspace_id = ${workspaceId}) as answers,
        (select count(*)::int from kb_sources where workspace_id = ${workspaceId}) as sources
    `)
  ).rows as Array<{ capabilities: number; services: number; answers: number; sources: number }>;
  return row;
}

export interface ApprovedAnswerRow {
  id: string;
  canonicalQuestion: string;
  canonicalAnswer: string;
  module: Module;
  tags: string[];
  reuseCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  originRfpId: string | null;
  originRfpTitle: string | null;
  originQuestionId: string | null;
  embedded: boolean;
}

const answerColumns = {
  id: approvedAnswers.id,
  canonicalQuestion: approvedAnswers.canonicalQuestion,
  canonicalAnswer: approvedAnswers.canonicalAnswer,
  module: approvedAnswers.module,
  tags: approvedAnswers.tags,
  reuseCount: approvedAnswers.reuseCount,
  lastUsedAt: approvedAnswers.lastUsedAt,
  createdAt: approvedAnswers.createdAt,
  originRfpId: approvedAnswers.originRfpId,
  originRfpTitle: rfps.title,
  originQuestionId: responses.questionId,
  embedded: sql<boolean>`${approvedAnswers.embedding} is not null`.mapWith(Boolean),
};

/** The flywheel's contents: most reused first, then newest. */
export async function listApprovedAnswers(workspaceId: string, filters: { q?: string; module?: Module | null } = {}): Promise<ApprovedAnswerRow[]> {
  const pattern = filters.q?.trim() ? likePattern(filters.q) : null;
  return db
    .select(answerColumns)
    .from(approvedAnswers)
    .leftJoin(rfps, eq(rfps.id, approvedAnswers.originRfpId))
    .leftJoin(responses, eq(responses.id, approvedAnswers.originResponseId))
    .where(
      and(
        eq(approvedAnswers.workspaceId, workspaceId),
        filters.module ? eq(approvedAnswers.module, filters.module) : undefined,
        pattern
          ? or(
              ilike(approvedAnswers.canonicalQuestion, pattern),
              ilike(approvedAnswers.canonicalAnswer, pattern),
              sql`array_to_string(${approvedAnswers.tags}, ' ') ilike ${pattern}`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(approvedAnswers.reuseCount), desc(approvedAnswers.createdAt));
}

export async function getApprovedAnswer(workspaceId: string, id: string): Promise<ApprovedAnswerRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select(answerColumns)
    .from(approvedAnswers)
    .leftJoin(rfps, eq(rfps.id, approvedAnswers.originRfpId))
    .leftJoin(responses, eq(responses.id, approvedAnswers.originResponseId))
    .where(and(eq(approvedAnswers.workspaceId, workspaceId), eq(approvedAnswers.id, id)))
    .limit(1);
  return row ?? null;
}

export interface KbSourceRow {
  id: string;
  name: string;
  kind: KbSourceKind;
  fileUrl: string | null;
  ingestedAt: Date;
  status: JobStatus;
  error: string | null;
  progressDone: number;
  progressTotal: number;
  entryCount: number;
  activeCount: number;
  /** The entry type most of its entries carry — which tab "View entries" opens. */
  dominantType: KbEntryType | null;
}

const sourceColumns = {
  id: kbSources.id,
  name: kbSources.name,
  kind: kbSources.kind,
  fileUrl: kbSources.fileUrl,
  ingestedAt: kbSources.ingestedAt,
  status: kbSources.status,
  error: kbSources.error,
  progressDone: kbSources.progressDone,
  progressTotal: kbSources.progressTotal,
  // Written out as kb_sources.id on purpose: in a single-table select Drizzle renders `${kbSources.id}` as a bare
  // "id", which inside the subquery binds to kb_entries.id and silently counts nothing.
  entryCount: sql<number>`(select count(*)::int from kb_entries e where e.source_id = kb_sources.id)`.mapWith(Number),
  activeCount: sql<number>`(select count(*)::int from kb_entries e where e.source_id = kb_sources.id and e.is_active)`.mapWith(Number),
  dominantType: sql<KbEntryType | null>`(select e.entry_type from kb_entries e where e.source_id = kb_sources.id group by e.entry_type order by count(*) desc limit 1)`,
};

export async function listKbSources(workspaceId: string): Promise<KbSourceRow[]> {
  return db.select(sourceColumns).from(kbSources).where(eq(kbSources.workspaceId, workspaceId)).orderBy(desc(kbSources.ingestedAt));
}

export async function getKbSource(workspaceId: string, id: string): Promise<KbSourceRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select(sourceColumns).from(kbSources).where(and(eq(kbSources.workspaceId, workspaceId), eq(kbSources.id, id))).limit(1);
  return row ?? null;
}
