/**
 * Shows what the drafting engine would retrieve for a handful of typical RFP
 * questions: the top knowledge-base entries and precedents with their
 * similarity and source. Use it after an ingest to see the new material
 * surface, or when an answer cites something odd.
 *
 *   pnpm kb:probe
 *   pnpm kb:probe "Can payroll run per legal entity?"
 */
import "@/lib/load-env";

import { retrieveApprovedAnswers, retrieveEntries } from "@/db/queries/kb";
import { WORKSPACE_ID } from "@/db/seed/data/workspace";
import { embedQuery } from "@/engine/embed";

const DEFAULT_QUESTIONS = [
  "Can payroll run per legal entity with separate PF, ESI and PT registrations?",
  "Configure leave policies per entity with carry-forward and encashment rules.",
  "What is your approach to data and document migration from the legacy HRMS?",
  "Describe your implementation methodology and typical timeline for a group with multiple entities.",
  "How do you run change management and adoption across plants and corporate teams?",
  "What is the group HR function's mandate post-demerger and how should the operating model be sequenced?",
];

async function main() {
  const questions = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_QUESTIONS;
  for (const q of questions) {
    const embedding = await embedQuery(q);
    const [entries, answers] = await Promise.all([
      retrieveEntries(WORKSPACE_ID, embedding, { owner: "joint", module: "general", k: 4 }),
      retrieveApprovedAnswers(WORKSPACE_ID, embedding, 3),
    ]);
    console.log(`\n=== ${q}`);
    for (const e of entries) console.log(`  entry  ${e.similarity.toFixed(3)}  ${e.entryType} · ${e.product} · ${e.module} · ${e.featureName}`);
    for (const a of answers) console.log(`  answer ${a.similarity.toFixed(3)}  ${a.canonicalQuestion.slice(0, 90)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[kb:probe] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
