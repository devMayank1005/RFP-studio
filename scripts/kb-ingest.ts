/**
 * Turns a document into knowledge-base content.
 *
 *   pnpm kb:ingest "~/Desktop/Standard Integration docs/Biometric API integration.pdf"
 *   pnpm kb:ingest deck.pptx --kind internal_doc --type kognoz_service --product Kognoz
 *   pnpm kb:ingest "TOI-RFP (filled).xlsx" --kind rfp_response --client "Times of India"   # rows → precedents, no model
 *   pnpm kb:ingest transcript.md --kind rfp_response --name "Axiata RFP response (chat)"
 *   pnpm kb:ingest <file> --dry-run                                     # print what would be written, touch nothing
 *
 * Accepts PDF, DOCX, PPTX, XLSX, Markdown and plain text. `--kind rfp_response`
 * writes precedents (question/answer pairs into approved_answers); every other
 * kind writes entries. Idempotent per source name: ids derive from the name
 * and the feature/question, so re-running updates in place and re-embeds only
 * what changed. A kb_sources row records where the content came from.
 */
import "@/lib/load-env";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { embedPendingAnswers, embedPendingForSource, finishKbSource, upsertKbSource, writeIngestedEntries, writeIngestedPrecedents } from "@/db/kb-ingest";
import { WORKSPACE_ID } from "@/db/seed/data/workspace";
import { KB_ENTRY_TYPES, KB_SOURCE_KINDS, type KbEntryType, type KbSourceKind } from "@/domain/enums";
import { sheetPrecedents, type Precedent } from "@/domain/ingest";
import { scrubClientName } from "@/domain/kb";
import { resolveColumns } from "@/engine/columns";
import { extractKbEntries, extractPrecedents } from "@/engine/ingest";
import { parseDocument, type ParsedDocument } from "@/lib/parsing";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T, label: string): T {
  if (value === undefined) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  console.error(`--${label} must be one of ${allowed.join(" | ")}`);
  process.exit(1);
}

async function sheetPrecedentsOf(doc: ParsedDocument): Promise<Precedent[] | null> {
  let any = false;
  const out: Precedent[] = [];
  for (const sheet of doc.sheets ?? []) {
    if (sheet.rows.length < 3) continue;
    const cols = await resolveColumns(sheet);
    if (!cols.map.hasQuestion || !cols.map.existingAnswer) continue;
    any = true;
    out.push(...sheetPrecedents(sheet, cols.map));
  }
  return any ? out : null;
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--") && !process.argv[process.argv.indexOf(a) - 1]?.startsWith("--"));
  if (!file) {
    console.error("usage: pnpm kb:ingest <file> [--kind darwinbox_docs|internal_doc|rfp_response] [--type <entry type>] [--product Darwinbox] [--name <source name>] [--client <client name to scrub>] [--dry-run]");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const product = flag("product") ?? "Darwinbox";
  const entryType = pick<KbEntryType>(flag("type"), KB_ENTRY_TYPES, "darwinbox_capability", "type");
  const kind = pick<KbSourceKind>(flag("kind"), KB_SOURCE_KINDS, "darwinbox_docs", "kind");
  const sourceName = flag("name") ?? path.basename(file);
  // A past response names its client; a precedent must not, or the next draft for another client repeats it.
  const client = flag("client");

  const started = Date.now();
  const doc = await parseDocument({ fileName: path.basename(file), buffer: await readFile(file) });
  console.log(`[parse] ${doc.kind} · ${JSON.stringify(doc.stats)}`);

  if (kind === "rfp_response") {
    let precedents = doc.kind === "xlsx" ? await sheetPrecedentsOf(doc) : null;
    if (!precedents) {
      if (!doc.pages?.length) {
        console.error(`[ingest] ${sourceName}: no readable text and no answered sheet.`);
        process.exit(1);
      }
      const r = await extractPrecedents(doc.pages, { sourceName, onProgress: (d, t) => console.log(`[ingest] chunk ${d}/${t}`) });
      precedents = r.precedents;
      console.log("[usage]", r.usage);
    }
    if (client) precedents = precedents.map((p) => ({ ...p, question: scrubClientName(p.question, client), answer: scrubClientName(p.answer, client) }));
    console.log(`\n[result] ${precedents.length} precedents · ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.table(precedents.map((p) => ({ question: p.question.slice(0, 70), module: p.module, chars: p.answer.length, tags: p.tags.join(", ") })));
    if (dryRun) {
      const out = file.replace(/\.[^.]+$/, "") + ".precedents.json";
      await writeFile(out, JSON.stringify({ sourceName, kind, precedents }, null, 2));
      console.log(`\n[dry-run] nothing written to the database; precedents saved to ${out}`);
      return;
    }
    if (!precedents.length) {
      console.log("[ingest] nothing to write");
      return;
    }
    const sourceId = await upsertKbSource({ workspaceId: WORKSPACE_ID, sourceName, kind, status: "running" });
    const ids = await writeIngestedPrecedents({ workspaceId: WORKSPACE_ID, sourceName, precedents });
    const embedded = await embedPendingAnswers(ids);
    await finishKbSource(sourceId, "done", { entryCount: ids.length });
    console.log(`\n[ingest] ${ids.length} precedents written for "${sourceName}" (${embedded} embedded now)`);
    return;
  }

  if (!doc.pages?.length) {
    console.error(`[ingest] ${sourceName}: no pages of text (${doc.kind}).`);
    process.exit(1);
  }
  const { entries, usage, calls } = await extractKbEntries(doc.pages, {
    sourceName,
    entryType,
    onProgress: (d, t) => console.log(`[ingest] chunk ${d}/${t}`),
  });
  console.log(`\n[result] ${entries.length} entries · ${calls} call${calls === 1 ? "" : "s"} · ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log("[usage]", usage);
  console.table(entries.map((e) => ({ feature: e.featureName, module: e.module, availability: e.availability, chars: e.body.length, tags: e.tags.join(", ") })));

  if (dryRun) {
    const out = file.replace(/\.[^.]+$/, "") + ".kb.json";
    await writeFile(out, JSON.stringify({ sourceName, product, entryType, kind, entries }, null, 2));
    console.log(`\n[dry-run] nothing written to the database; entries saved to ${out}`);
    return;
  }
  if (!entries.length) {
    console.log("[ingest] nothing to write");
    return;
  }

  const sourceId = await upsertKbSource({ workspaceId: WORKSPACE_ID, sourceName, kind, status: "running" });
  const written = await writeIngestedEntries({ workspaceId: WORKSPACE_ID, sourceId, sourceName, product, entryType, entries });
  const embedded = await embedPendingForSource(sourceId);
  await finishKbSource(sourceId, "done", { entryCount: written });
  console.log(`\n[ingest] ${written} entries written for "${sourceName}" (${embedded} embedded now)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[ingest] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
