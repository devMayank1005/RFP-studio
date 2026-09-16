/**
 * Runs CHRO question generation for one RFP and prints the set, grouped by
 * theme, without writing anything. For tuning prompts/chro.ts.
 *
 *   pnpm exec tsx scripts/chro-preview.ts <rfpId>
 */
import "@/lib/load-env";

import { getChroClientContext, getChroSourceRows, listChroQuestions } from "@/db/queries/chro";
import { CHRO_THEME_LABEL } from "@/domain/enums";
import { groupByTheme, selectChroSources } from "@/domain/chro";
import { generateChroQuestions } from "@/engine/chro";

async function main() {
  const rfpId = process.argv[2];
  if (!rfpId) {
    console.error("usage: tsx scripts/chro-preview.ts <rfpId>");
    process.exit(1);
  }
  const ctx = await getChroClientContext(rfpId);
  if (!ctx) throw new Error("rfp not found");
  const { approved, gaps } = selectChroSources(await getChroSourceRows(rfpId));
  const kept = (await listChroQuestions(ctx.workspaceId, rfpId))?.filter((r) => r.status === "kept") ?? [];
  console.log(`[chro] ${ctx.clientName} · ${approved.length} approved · ${gaps.length} gaps · ${kept.length} kept already`);
  const started = Date.now();
  const { questions, usage, model } = await generateChroQuestions({ ...ctx, approved, gaps, keptQuestions: kept.map((k) => ({ theme: k.theme, questionText: k.questionText })) });
  console.log(`[chro] ${questions.length} questions · ${model} · ${((Date.now() - started) / 1000).toFixed(0)}s`, usage);
  for (const g of groupByTheme(questions)) {
    if (!g.rows.length) continue;
    console.log(`\n${CHRO_THEME_LABEL[g.theme]}`);
    for (const q of g.rows) console.log(`  • ${q.questionText}\n    — ${q.rationale}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[chro] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
