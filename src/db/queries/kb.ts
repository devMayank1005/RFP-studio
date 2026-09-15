import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { approvedAnswers, kbEntries } from "@/db/schema";
import type { Availability, KbEntryType, Module, Owner } from "@/domain/enums";

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
