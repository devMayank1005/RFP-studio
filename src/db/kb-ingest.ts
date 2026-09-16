import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { kbEntries, kbSources } from "@/db/schema";
import { stableId } from "@/db/seed/ids";
import type { JobStatus, KbEntryType, KbSourceKind } from "@/domain/enums";
import { ingestEntrySlug, type IngestEntry } from "@/domain/ingest";
import { embedDocuments, kbEntryEmbedText } from "@/engine/embed";

/**
 * Writing an ingested document into the knowledge base — shared by the
 * browser job and `pnpm kb:ingest`, so both derive the same ids and a file
 * ingested either way updates in place instead of duplicating.
 */

export function kbSourceIdFor(sourceName: string): string {
  return stableId("kb_source", ingestEntrySlug(sourceName, ""));
}

export function kbEntryIdFor(sourceName: string, featureName: string): string {
  return stableId("kb_entry", ingestEntrySlug(sourceName, featureName));
}

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

export async function setKbSourceProgress(sourceId: string, done: number, total: number) {
  await db.update(kbSources).set({ status: "running", progressDone: done, progressTotal: total }).where(eq(kbSources.id, sourceId));
}

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
