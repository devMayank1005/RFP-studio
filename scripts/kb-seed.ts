/**
 * Embeds every knowledge-base entry and approved answer that has no
 * embedding yet (or whose text changed — the seed nulls the embedding when
 * a body changes). Idempotent; re-run after `pnpm db:seed` or `kb:ingest`.
 *
 *   pnpm kb:seed
 */
import "@/lib/load-env";

import { eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { approvedAnswers, kbEntries } from "@/db/schema";
import { approvedAnswerEmbedText, embedDocuments, kbEntryEmbedText } from "@/engine/embed";

async function main() {
  const entries = await db.select().from(kbEntries).where(isNull(kbEntries.embedding));
  console.log(`[kb:seed] ${entries.length} entries to embed`);
  if (entries.length) {
    const vectors = await embedDocuments(entries.map(kbEntryEmbedText));
    for (const [i, e] of entries.entries()) {
      await db.update(kbEntries).set({ embedding: vectors[i] }).where(eq(kbEntries.id, e.id));
    }
  }

  const answers = await db.select().from(approvedAnswers).where(isNull(approvedAnswers.embedding));
  console.log(`[kb:seed] ${answers.length} approved answers to embed`);
  if (answers.length) {
    const vectors = await embedDocuments(answers.map(approvedAnswerEmbedText));
    for (const [i, a] of answers.entries()) {
      await db.update(approvedAnswers).set({ embedding: vectors[i] }).where(eq(approvedAnswers.id, a.id));
    }
  }

  const [{ total, embedded }] = (
    await db.execute(sql`select count(*)::int as total, count(embedding)::int as embedded from kb_entries where is_active`)
  ).rows as Array<{ total: number; embedded: number }>;
  console.log(`[kb:seed] done — ${embedded}/${total} active entries embedded`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[kb:seed] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
