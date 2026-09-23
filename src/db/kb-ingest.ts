import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { approvedAnswers, kbEntries, kbSources } from "@/db/schema";
import { stableId } from "@/db/seed/ids";
import type { JobStatus, KbEntryType, KbSourceKind } from "@/domain/enums";
import { ingestEntrySlug, precedentSlug, type IngestEntry, type Precedent } from "@/domain/ingest";
import { approvedAnswerEmbedText, embedDocuments, kbEntryEmbedText } from "@/engine/embed";

/**
 * Writing an ingested document into the knowledge base — shared by the
 * browser job and `pnpm kb:ingest`, so both derive the same ids and a file
 * ingested either way updates in place instead of duplicating.
 */

/** Stable id for a source, derived from its name, so re-ingesting the same file updates the same row. */
export function kbSourceIdFor(sourceName: string): string {
  return stableId("kb_source", ingestEntrySlug(sourceName, ""));
}

/** Stable id for an entry, derived from source and feature name, so a re-ingest updates rather than duplicates. */
export function kbEntryIdFor(sourceName: string, featureName: string): string {
  return stableId("kb_entry", ingestEntrySlug(sourceName, featureName));
}

/**
 * Create or reset the source row for a document about to be ingested: progress back to zero, error cleared, `ingestedAt` now.
 * @returns The stable source id.
 * @sideEffects Writes `kb_sources`; sends no events.
 */
export async function upsertKbSource(input: { workspaceId: string; sourceName: string; kind: KbSourceKind; fileUrl?: string | null; status: JobStatus }): Promise<string> {
  const id = kbSourceIdFor(input.sourceName);
  await db
    .insert(kbSources)
    .values({ id, workspaceId: input.workspaceId, name: input.sourceName, kind: input.kind, fileUrl: input.fileUrl ?? null, status: input.status, error: null, progressDone: 0, progressTotal: 0 })
    .onConflictDoUpdate({
      target: kbSources.id,
      set: {
        name: input.sourceName,
        kind: input.kind,
        ...(input.fileUrl ? { fileUrl: input.fileUrl } : {}),
        status: input.status,
        error: null,
        progressDone: 0,
        progressTotal: 0,
        ingestedAt: new Date(),
      },
    });
  return id;
}

/**
 * Record ingest progress on the source and mark it `running` — the sources tab polls this.
 * @sideEffects Updates `kb_sources`; sends no events.
 */
export async function setKbSourceProgress(sourceId: string, done: number, total: number) {
  await db.update(kbSources).set({ status: "running", progressDone: done, progressTotal: total }).where(eq(kbSources.id, sourceId));
}

/**
 * Close the source as done or failed; the error is cut to what the row can hold.
 * @sideEffects Updates `kb_sources`; sends no events.
 */
export async function finishKbSource(sourceId: string, status: Extract<JobStatus, "done" | "failed">, opts: { error?: string; entryCount?: number } = {}) {
  await db
    .update(kbSources)
    .set({ status, error: opts.error?.slice(0, 500) ?? null, ...(opts.entryCount !== undefined ? { entryCount: opts.entryCount } : {}), ingestedAt: new Date() })
    .where(eq(kbSources.id, sourceId));
}

/** Upsert the entries of one document. A changed body nulls the embedding so retrieval never cites stale text. */
export async function writeIngestedEntries(input: { workspaceId: string; sourceId: string; sourceName: string; product: string; entryType: KbEntryType; entries: IngestEntry[] }): Promise<number> {
  if (!input.entries.length) return 0;
  const rows = input.entries.map((e) => ({
    id: kbEntryIdFor(input.sourceName, e.featureName),
    workspaceId: input.workspaceId,
    entryType: input.entryType,
    product: input.product,
    module: e.module,
    featureName: e.featureName,
    body: e.body,
    availability: e.availability,
    tags: e.tags,
    sourceId: input.sourceId,
    isActive: true,
  }));
  await db
    .insert(kbEntries)
    .values(rows)
    .onConflictDoUpdate({
      target: kbEntries.id,
      set: {
        entryType: sql`excluded."entry_type"`,
        product: sql`excluded."product"`,
        module: sql`excluded."module"`,
        featureName: sql`excluded."feature_name"`,
        body: sql`excluded."body"`,
        availability: sql`excluded."availability"`,
        tags: sql`excluded."tags"`,
        sourceId: sql`excluded."source_id"`,
        isActive: true,
        embedding: sql`case when ${kbEntries.body} is distinct from excluded."body" then null else ${kbEntries.embedding} end`,
      },
    });
  return rows.length;
}

/** Embed every entry of a source that has no vector yet. Returns how many were embedded. */
export async function embedPendingForSource(sourceId: string): Promise<number> {
  const pending = await db.select({ id: kbEntries.id, product: kbEntries.product, module: kbEntries.module, featureName: kbEntries.featureName, body: kbEntries.body, tags: kbEntries.tags }).from(kbEntries).where(and(eq(kbEntries.sourceId, sourceId), isNull(kbEntries.embedding)));
  if (!pending.length) return 0;
  const vectors = await embedDocuments(pending.map(kbEntryEmbedText));
  for (const [i, e] of pending.entries()) await db.update(kbEntries).set({ embedding: vectors[i] }).where(eq(kbEntries.id, e.id));
  return pending.length;
}

/** Stable id for a precedent, scoped by workspace and derived from source and question, so a re-ingest updates in place. */
export function precedentIdFor(workspaceId: string, sourceName: string, question: string): string {
  return stableId("approved_answer", `${workspaceId}:${precedentSlug(sourceName, question)}`);
}

/**
 * Upsert the precedents of one past response as approved answers: no origin
 * response or RFP (they predate the app), a stable id per source + question so
 * re-ingesting updates in place, and the embedding nulled when the answer
 * changed. Returns the ids written so the caller can embed exactly those.
 */
export async function writeIngestedPrecedents(input: { workspaceId: string; sourceName: string; precedents: Precedent[] }): Promise<string[]> {
  if (!input.precedents.length) return [];
  // One row per id even if two questions normalise alike; Postgres refuses to touch a row twice in one upsert.
  const byId = new Map(
    input.precedents.map((p) => [
      precedentIdFor(input.workspaceId, input.sourceName, p.question),
      { workspaceId: input.workspaceId, canonicalQuestion: p.question, canonicalAnswer: p.answer, module: p.module, tags: p.tags },
    ]),
  );
  const rows = [...byId.entries()].map(([id, r]) => ({ id, ...r }));
  for (let i = 0; i < rows.length; i += 100) {
    await db
      .insert(approvedAnswers)
      .values(rows.slice(i, i + 100))
      .onConflictDoUpdate({
        target: approvedAnswers.id,
        set: {
          canonicalQuestion: sql`excluded."canonical_question"`,
          canonicalAnswer: sql`excluded."canonical_answer"`,
          module: sql`excluded."module"`,
          tags: sql`excluded."tags"`,
          embedding: sql`case when ${approvedAnswers.canonicalAnswer} is distinct from excluded."canonical_answer" or ${approvedAnswers.canonicalQuestion} is distinct from excluded."canonical_question" then null else ${approvedAnswers.embedding} end`,
        },
      });
  }
  return rows.map((r) => r.id);
}

/** Embed the given approved answers that have no vector yet. Returns how many were embedded. */
export async function embedPendingAnswers(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const pending = await db
    .select({ id: approvedAnswers.id, canonicalQuestion: approvedAnswers.canonicalQuestion, canonicalAnswer: approvedAnswers.canonicalAnswer })
    .from(approvedAnswers)
    .where(and(inArray(approvedAnswers.id, ids), isNull(approvedAnswers.embedding)));
  if (!pending.length) return 0;
  const vectors = await embedDocuments(pending.map(approvedAnswerEmbedText));
  for (const [i, a] of pending.entries()) await db.update(approvedAnswers).set({ embedding: vectors[i] }).where(eq(approvedAnswers.id, a.id));
  return pending.length;
}
