import { NonRetriableError } from "inngest";

import { embedPendingForSource, finishKbSource, setKbSourceProgress, writeIngestedEntries } from "@/db/kb-ingest";
import { chunkPages } from "@/domain/extraction";
import { INGEST_CHARS_PER_CHUNK, extractKbEntries } from "@/engine/ingest";
import { readPrivate } from "@/lib/blob";
import { parseDocument } from "@/lib/parsing";

import { inngest, kbIngestRequested } from "./client";

/**
 * A document from the Knowledge base screen becomes entries. Sonnet reads
 * ~24k characters per call and a manual can be minutes long, so this runs
 * as a durable job with progress on the kb_sources row, not inside the
 * browser's request.
 */
export const ingestKbSource = inngest.createFunction(
  {
    id: "ingest-kb-source",
    retries: 1,
    // A re-delivered event for the same job never starts a second run.
    idempotency: "event.data.sourceId",
    // Per-workspace fairness first, then a global ceiling.
    concurrency: [
      { limit: 1, key: "event.data.workspaceId" },
      { limit: 2 },
    ],
    triggers: [kbIngestRequested],
    onFailure: async ({ event, error }) => {
      await finishKbSource(event.data.event.data.sourceId, "failed", { error: error.message });
    },
  },
  async ({ event, step }) => {
    const { sourceId, workspaceId, sourceName, fileUrl, product, entryType } = event.data;

    const pages = await step.run("parse", async () => {
      await setKbSourceProgress(sourceId, 0, 0);
      const doc = await parseDocument({ fileName: sourceName, buffer: await readPrivate(fileUrl) });
      if (!doc.pages?.length) throw new NonRetriableError("No text found — only PDF and DOCX documents with readable text can be ingested.");
      await setKbSourceProgress(sourceId, 0, chunkPages(doc.pages, INGEST_CHARS_PER_CHUNK).length);
      return doc.pages;
    });

    const entries = await step.run("extract", async () => {
      const result = await extractKbEntries(pages, { sourceName, onProgress: (done, total) => setKbSourceProgress(sourceId, done, total) });
      return result.entries;
    });

    const written = await step.run("write", async () => {
      const n = await writeIngestedEntries({ workspaceId, sourceId, sourceName, product, entryType, entries });
      await embedPendingForSource(sourceId);
      return n;
    });

    await step.run("finish", () => finishKbSource(sourceId, "done", { entryCount: written }));
    return { entries: written };
  },
);
