/**
 * Moves the files written before September 2026 out of the retired Vercel
 * Blob store into the Neon bucket and repoints every row that held their
 * URL: rfp_documents (original and parsed text), exports, kb_sources and
 * the parsedTextUrl inside quick jobs' payloads. Each file is copied under
 * its old pathname (with a fresh key suffix) and the row is updated only
 * after the copy succeeded, so the script can be re-run after a failure.
 *
 * Needs BLOB_READ_WRITE_TOKEN for a store that is readable: while the store
 * is suspended on Vercel every read fails and nothing is changed.
 *
 *   pnpm storage:migrate --dry-run   # list what would move
 *   pnpm storage:migrate
 */
import "@/lib/load-env";

import { eq, like, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { exports as exportsTable, generationJobs, kbSources, rfpDocuments } from "@/db/schema";
import { StorageUnavailableError, isLegacyBlobUrl } from "@/domain/storage";
import { readPrivate, uploadPrivate } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  json: "application/json",
  txt: "text/plain",
  md: "text/markdown",
};

interface Legacy {
  where: string;
  url: string;
  apply: (key: string) => Promise<unknown>;
}

const LEGACY_PREFIX = "https://%vercel-storage.com/%";

async function collect(): Promise<Legacy[]> {
  const out: Legacy[] = [];
  const docs = await db
    .select({ id: rfpDocuments.id, fileUrl: rfpDocuments.fileUrl, parsedTextUrl: rfpDocuments.parsedTextUrl })
    .from(rfpDocuments)
    .where(or(like(rfpDocuments.fileUrl, LEGACY_PREFIX), like(rfpDocuments.parsedTextUrl, LEGACY_PREFIX)));
  for (const d of docs) {
    if (isLegacyBlobUrl(d.fileUrl)) out.push({ where: `rfp_documents.file_url ${d.id}`, url: d.fileUrl, apply: (key) => db.update(rfpDocuments).set({ fileUrl: key }).where(eq(rfpDocuments.id, d.id)) });
    if (d.parsedTextUrl && isLegacyBlobUrl(d.parsedTextUrl)) out.push({ where: `rfp_documents.parsed_text_url ${d.id}`, url: d.parsedTextUrl, apply: (key) => db.update(rfpDocuments).set({ parsedTextUrl: key }).where(eq(rfpDocuments.id, d.id)) });
  }
  const exps = await db.select({ id: exportsTable.id, fileUrl: exportsTable.fileUrl }).from(exportsTable).where(like(exportsTable.fileUrl, LEGACY_PREFIX));
  for (const e of exps) if (e.fileUrl && isLegacyBlobUrl(e.fileUrl)) out.push({ where: `exports.file_url ${e.id}`, url: e.fileUrl, apply: (key) => db.update(exportsTable).set({ fileUrl: key }).where(eq(exportsTable.id, e.id)) });
  const sources = await db.select({ id: kbSources.id, fileUrl: kbSources.fileUrl }).from(kbSources).where(like(kbSources.fileUrl, LEGACY_PREFIX));
  for (const s of sources) if (s.fileUrl && isLegacyBlobUrl(s.fileUrl)) out.push({ where: `kb_sources.file_url ${s.id}`, url: s.fileUrl, apply: (key) => db.update(kbSources).set({ fileUrl: key }).where(eq(kbSources.id, s.id)) });
  const jobs = await db
    .select({ id: generationJobs.id, url: sql<string | null>`${generationJobs.payload}->>'parsedTextUrl'` })
    .from(generationJobs)
    .where(sql`${generationJobs.payload}->>'parsedTextUrl' like ${LEGACY_PREFIX}`);
  for (const j of jobs) if (j.url && isLegacyBlobUrl(j.url)) out.push({ where: `generation_jobs.payload.parsedTextUrl ${j.id}`, url: j.url, apply: (key) => db.update(generationJobs).set({ payload: sql`jsonb_set(${generationJobs.payload}, '{parsedTextUrl}', to_jsonb(${key}::text))` }).where(eq(generationJobs.id, j.id)) });
  return out;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const items = await collect();
  console.log(`[migrate] ${items.length} legacy file reference(s)${dryRun ? " (dry run)" : ""}`);
  if (dryRun) {
    for (const item of items) console.log(`[migrate]   ${item.where} → ${new URL(item.url).pathname.slice(1)}`);
    return;
  }
  const moved = new Map<string, string>();
  let failed = 0;
  for (const item of items) {
    try {
      let key = moved.get(item.url);
      if (!key) {
        const pathname = new URL(item.url).pathname.slice(1);
        const bytes = await readPrivate(item.url);
        key = (await uploadPrivate(pathname, bytes, CONTENT_TYPES[pathname.split(".").pop()?.toLowerCase() ?? ""])).url;
        moved.set(item.url, key);
      }
      await item.apply(key);
      console.log(`[migrate]   ${item.where} → ${key}`);
    } catch (err) {
      failed++;
      console.error(`[migrate]   ${item.where} FAILED: ${err instanceof StorageUnavailableError || err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`[migrate] ${items.length - failed} moved · ${failed} failed`);
  if (failed) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migrate] FAILED", err instanceof Error ? err.message : err);
    process.exit(1);
  });
