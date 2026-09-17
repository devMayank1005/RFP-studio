import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db/client";
import { finishJob, markJobRunning, setJobProgress } from "@/db/jobs";
import { getDocumentForJob } from "@/db/queries/documents";
import { rfpDocuments } from "@/db/schema";
import { getJson, putJson, readPrivate, rfpParsedPath } from "@/lib/blob";
import { parseDocument, type ParsedDocument } from "@/lib/parsing";

import { documentUploaded, inngest } from "./client";

/**
 * Deterministic text extraction for one uploaded file. Writes the
 * ParsedDocument JSON back to Blob and marks the document parsed; the
 * extraction job reads that JSON, never the original file again.
 */
export const parseUploadedDocument = inngest.createFunction(
  {
    id: "parse-document",
    retries: 2,
    // A re-delivered event for the same job never starts a second run.
    idempotency: "event.data.jobId",
    // Per-workspace fairness first, then a global ceiling.
    concurrency: [
      { limit: 4, key: "event.data.workspaceId" },
      { limit: 8 },
    ],
    triggers: [documentUploaded],
    onFailure: async ({ event, error }) => {
      const { documentId, jobId } = event.data.event.data;
      await db.update(rfpDocuments).set({ parseStatus: "failed", parseError: error.message }).where(eq(rfpDocuments.id, documentId));
      await finishJob(jobId, "failed", error.message);
    },
  },
  async ({ event, step, runId }) => {
    const { documentId, jobId } = event.data;

    await step.run("mark-running", async () => {
      await markJobRunning(jobId, runId);
      await db.update(rfpDocuments).set({ parseStatus: "parsing", parseError: null }).where(eq(rfpDocuments.id, documentId));
    });

    const stats = await step.run("parse", async () => {
      const doc = await getDocumentForJob(documentId);
      if (!doc) throw new NonRetriableError(`document ${documentId} no longer exists`);
      const buffer = await readPrivate(doc.fileUrl);
      const parsed = await parseDocument({ fileName: doc.fileName, mime: doc.mime, buffer });
      const { url } = await putJson(rfpParsedPath(doc.rfpId, doc.id), parsed);
      await db
        .update(rfpDocuments)
        .set({
          parseStatus: "parsed",
          parsedTextUrl: url,
          pageCount: parsed.stats.pages ?? parsed.stats.rows ?? null,
          parseError: null,
        })
        .where(eq(rfpDocuments.id, doc.id));
      return { kind: parsed.kind, ...parsed.stats };
    });

    await step.run("finish", async () => {
      await setJobProgress(jobId, 1, 1);
      await finishJob(jobId, "done");
    });
    return stats;
  },
);

/** Helper for the extraction job: the parsed JSON of a document. */
export async function loadParsed(parsedTextUrl: string): Promise<ParsedDocument> {
  return getJson<ParsedDocument>(parsedTextUrl);
}
