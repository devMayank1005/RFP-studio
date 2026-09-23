import { NonRetriableError } from "inngest";

import { embedPendingAnswers, embedPendingForSource, finishKbSource, setKbSourceProgress, writeIngestedEntries, writeIngestedPrecedents } from "@/db/kb-ingest";
import { chunkPages } from "@/domain/extraction";
import { sheetPrecedents, type Precedent } from "@/domain/ingest";
import { resolveColumns } from "@/engine/columns";
import { INGEST_CHARS_PER_CHUNK, extractKbEntries, extractPrecedents } from "@/engine/ingest";
import { readPrivate } from "@/lib/blob";
import { parseDocument, type ParsedDocument } from "@/lib/parsing";
import { redactSecrets } from "@/lib/redact";
import { reportError } from "@/lib/report";

import { inngest, kbIngestRequested } from "./client";

/**
 * A document from the Knowledge base screen becomes entries — or, for a past
 * RFP response, precedents (question/answer pairs). Sonnet reads ~24k
 * characters per call and a manual can be minutes long, so this runs as a
 * durable job with progress on the kb_sources row, not inside the browser's
 * request. Each model call is its own step: one Vercel invocation is capped
 * at 300 s on the Hobby plan.
 */
export const ingestKbSource = inngest.createFunction(
  {
    id: "ingest-kb-source",
    retries: 1,
    // A re-delivered event for the same job never starts a second run.
    idempotency: "event.data.sourceId",
    // Per-workspace fairness first, then a global ceiling (Inngest's free plan allows 5 concurrent steps in total).
    concurrency: [
      { limit: 1, key: "event.data.workspaceId" },
      { limit: 2 },
    ],
    triggers: [kbIngestRequested],
    onFailure: async ({ event, error }) => {
      const { sourceId, workspaceId } = event.data.event.data;
      reportError(error, { where: "job:ingest-kb", sourceId, workspaceId });
      await finishKbSource(sourceId, "failed", { error: redactSecrets(error.message) });
    },
  },
  async ({ event, step }) => {
    const { sourceId, workspaceId, sourceName, fileUrl, product, entryType } = event.data;
    const kind = event.data.kind ?? "darwinbox_docs";

    const plan = await step.run("parse", async (): Promise<{ chunks: number; sheetPrecedents: Precedent[] | null }> => {
      await setKbSourceProgress(sourceId, 0, 0);
      const doc = await parseDocument({ fileName: sourceName, buffer: await readPrivate(fileUrl) });
      if (kind === "rfp_response" && doc.kind === "xlsx") {
        // A filled requirements sheet needs no model: rows with a question and an answer are precedents as they stand.
        const found = await precedentsFromSheets(doc);
        if (found) {
          await setKbSourceProgress(sourceId, 0, 1);
          return { chunks: 0, sheetPrecedents: found };
        }
      }
      if (!doc.pages?.length) throw new NonRetriableError("No text found — the document has no readable text to ingest.");
      const chunks = chunkPages(doc.pages, INGEST_CHARS_PER_CHUNK).length;
      await setKbSourceProgress(sourceId, 0, chunks);
      return { chunks, sheetPrecedents: null };
    });

    // Extraction is one step per chunk so a retry re-reads one chunk, not the whole document.
    const chunkResults: Array<{ entries?: unknown; precedents?: Precedent[] }> = [];
    let known: string[] = [];
    if (!plan.sheetPrecedents) {
      for (let i = 0; i < plan.chunks; i++) {
        const result = await step.run(`read-chunk-${i}`, async () => {
          const doc = await parseDocument({ fileName: sourceName, buffer: await readPrivate(fileUrl) });
          const pages = chunkPages(doc.pages ?? [], INGEST_CHARS_PER_CHUNK)[i] ?? [];
          if (kind === "rfp_response") {
            const r = await extractPrecedents(pages, { sourceName, known });
            await setKbSourceProgress(sourceId, i + 1, plan.chunks);
            return { precedents: r.precedents, known: r.precedents.map((p) => p.question.slice(0, 120)) };
          }
          const r = await extractKbEntries(pages, { sourceName, entryType, known });
          await setKbSourceProgress(sourceId, i + 1, plan.chunks);
          return { entries: r.entries, known: r.entries.map((e) => e.featureName) };
        });
        chunkResults.push(result);
        known = [...known, ...result.known];
      }
    }

    const written = await step.run("write", async () => {
      if (kind === "rfp_response") {
        const precedents = plan.sheetPrecedents ?? chunkResults.flatMap((r) => r.precedents ?? []);
        const ids = await writeIngestedPrecedents({ workspaceId, sourceName, precedents });
        await embedPendingAnswers(ids);
        return ids.length;
      }
      const entries = chunkResults.flatMap((r) => (r.entries as Parameters<typeof writeIngestedEntries>[0]["entries"]) ?? []);
      const n = await writeIngestedEntries({ workspaceId, sourceId, sourceName, product, entryType, entries });
      await embedPendingForSource(sourceId);
      return n;
    });

    await step.run("finish", () => finishKbSource(sourceId, "done", { entryCount: written }));
    return { entries: written };
  },
);

/** Every sheet with a question column and an answer column contributes its rows; null when no sheet qualifies. */
async function precedentsFromSheets(doc: ParsedDocument): Promise<Precedent[] | null> {
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
