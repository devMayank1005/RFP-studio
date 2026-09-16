/**
 * Turns a product document (PDF or DOCX) into knowledge-base entries.
 *
 *   pnpm kb:ingest "~/Desktop/Standard Integration docs/Biometric API integration.pdf"
 *   pnpm kb:ingest <file> --dry-run                 # print what would be written, touch nothing
 *   pnpm kb:ingest <file> --product Darwinbox --type darwinbox_capability --kind darwinbox_docs
 *
 * Idempotent per file: every entry's id derives from the file name and the
 * feature name, so re-running updates in place (and re-embeds only entries
 * whose body changed). A kb_sources row records where the entries came from.
 */
import "@/lib/load-env";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { embedPendingForSource, finishKbSource, upsertKbSource, writeIngestedEntries } from "@/db/kb-ingest";
import { WORKSPACE_ID } from "@/db/seed/data/workspace";
import { KB_ENTRY_TYPES, KB_SOURCE_KINDS, type KbEntryType, type KbSourceKind } from "@/domain/enums";
import { extractKbEntries } from "@/engine/ingest";
import { parseDocument } from "@/lib/parsing";

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

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--") && !process.argv[process.argv.indexOf(a) - 1]?.startsWith("--"));
  if (!file) {
    console.error('usage: pnpm kb:ingest <file.pdf|file.docx> [--product Darwinbox] [--type darwinbox_capability] [--kind darwinbox_docs] [--dry-run]');
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const product = flag("product") ?? "Darwinbox";
  const entryType = pick<KbEntryType>(flag("type"), KB_ENTRY_TYPES, "darwinbox_capability", "type");
  const kind = pick<KbSourceKind>(flag("kind"), KB_SOURCE_KINDS, "darwinbox_docs", "kind");
  const sourceName = path.basename(file);

  const started = Date.now();
  const doc = await parseDocument({ fileName: sourceName, buffer: await readFile(file) });
  if (!doc.pages?.length) {
    console.error(`[ingest] ${sourceName}: no pages of text (${doc.kind}). Only PDF and DOCX documents can be ingested.`);
    process.exit(1);
  }
  console.log(`[parse] ${doc.kind} · ${JSON.stringify(doc.stats)}`);

  const { entries, usage, calls } = await extractKbEntries(doc.pages, {
    sourceName,
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
