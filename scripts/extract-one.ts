/**
 * Runs the extraction pipeline on one file and prints what it found.
 *
 *   pnpm exec tsx scripts/extract-one.ts "fixtures/private/vedanta-hr-transformation.xlsx"
 *   pnpm exec tsx scripts/extract-one.ts fixtures/public/rfp-narrative.pdf
 *
 * Writes the full result next to the file as <name>.extracted.json (private
 * fixtures are git-ignored, public ones are not — delete the json if you
 * don't want it committed).
 */
import "@/lib/load-env";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveColumns } from "@/engine/columns";
import { extractFromPages, extractFromSheet } from "@/engine/extract";
import { parseDocument } from "@/lib/parsing";

function tally<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) out[key(it)] = (out[key(it)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: tsx scripts/extract-one.ts <file>");
    process.exit(1);
  }
  const started = Date.now();
  const doc = await parseDocument({ fileName: path.basename(file), buffer: await readFile(file) });
  console.log(`[parse] ${doc.kind} · ${JSON.stringify(doc.stats)}`);

  let result;
  if (doc.kind === "xlsx") {
    const sheet = doc.sheets!.reduce((a, b) => (b.rows.length > a.rows.length ? b : a));
    const cols = await resolveColumns(sheet);
    console.log(`[columns] sheet "${sheet.name}" · model used: ${cols.usedModel}`);
    console.table(cols.roles);
    result = await extractFromSheet(sheet, cols.map, {
      onProgress: (d, t) => console.log(`[extract] chunk ${d}/${t}`),
    });
  } else {
    result = await extractFromPages(doc.pages!, {
      onProgress: (d, t) => console.log(`[extract] chunk ${d}/${t}`),
    });
  }

  const q = result.questions;
  console.log(`\n[result] ${q.length} questions · ${result.sections.length} sections · ${result.calls} calls · ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log("[usage]", result.usage);
  console.log("\nsections:", tally(q, (x) => x.sectionTitle));
  console.log("modules:", tally(q, (x) => x.moduleHint));
  console.log("owners:", tally(q, (x) => x.owner));
  console.log("types:", tally(q, (x) => x.questionType));
  console.log("mandatory:", q.filter((x) => x.isMandatory).length);
  const withExisting = q.filter((x) => x.existing?.compliance);
  if (withExisting.length) console.log("existing compliance:", tally(withExisting, (x) => x.existing!.compliance!));

  console.log("\nfirst 6:");
  for (const x of q.slice(0, 6)) {
    console.log(`  ${x.refNo} [${x.sectionTitle}] (${x.questionType}/${x.moduleHint}/${x.owner}${x.isMandatory ? "/must" : ""}) ${x.questionText.slice(0, 110)}`);
  }

  const out = file.replace(/\.[^.]+$/, "") + ".extracted.json";
  await writeFile(out, JSON.stringify(result, null, 2));
  console.log(`\nwrote ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
