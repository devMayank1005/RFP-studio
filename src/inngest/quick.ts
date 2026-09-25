import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db/client";
import { bumpJobProgress, finishJob, markJobRunning, setJobProgress } from "@/db/jobs";
import { rfpDocuments, rfps } from "@/db/schema";
import type { ExtractedQuestion } from "@/domain/extraction";
import { questionsFromLines } from "@/domain/quick";
import { putJson, readPrivate, rfpParsedPath } from "@/lib/storage";
import { parseDocument } from "@/lib/parsing";
import { failJob } from "@/lib/jobs";

import { inngest, quickRequested } from "./client";
import { countChunks, extractParsedDocument, persistExtractedQuestions } from "./extract-shared";
import { loadParsed } from "./parse";

/**
 * Quick Q&A intake: a paste (already stored as a parsed document) or an
 * uploaded file becomes questions. It stops there — the session page then
 * offers "Draft all responses" or "Draft this question", so nothing is
 * spent on a wrong extraction (the ordinary draft job does the drafting).
 * Parsing happens here, not in the action, so a 20 MB PDF never meets a
 * request timeout; every step returns small JSON — the document itself
 * stays in storage and is re-read by its handle.
 */
export const quickIntake = inngest.createFunction(
  {
    id: "quick-intake",
    retries: 1,
    // A re-delivered event for the same job never starts a second run.
    idempotency: "event.data.jobId",
    // Per-workspace fairness first, then a global ceiling (Inngest's free plan allows 5 concurrent steps in total).
    concurrency: [
      { limit: 2, key: "event.data.workspaceId" },
      { limit: 4 },
    ],
    triggers: [quickRequested],
    onFailure: async ({ event, error }) => {
      const { jobId, documentId, rfpId } = event.data.event.data;
      const message = await failJob(jobId, error, { where: "job:quick", rfpId });
      if (documentId) await db.update(rfpDocuments).set({ parseStatus: "failed", parseError: message }).where(eq(rfpDocuments.id, documentId));
      // The session stays in "parsing" so a Retry can run the intake again.
    },
  },
  async ({ event, step, runId }) => {
    const { rfpId, jobId, source, documentId, parsedTextUrl } = event.data;

    const read = await step.run("read", async (): Promise<{ parsedTextUrl: string; fileName: string }> => {
      await markJobRunning(jobId, runId);
      let url: string;
      let fileName: string;
      let chunks: number;
      if (source === "paste") {
        if (!parsedTextUrl) throw new NonRetriableError("the paste was not stored");
        const doc = await loadParsed(parsedTextUrl);
        url = parsedTextUrl;
        fileName = doc.fileName;
        chunks = countChunks(doc);
      } else {
        if (!documentId) throw new NonRetriableError("no document to read");
        const [doc] = await db.select({ id: rfpDocuments.id, fileName: rfpDocuments.fileName, fileUrl: rfpDocuments.fileUrl, mime: rfpDocuments.mime }).from(rfpDocuments).where(eq(rfpDocuments.id, documentId)).limit(1);
        if (!doc) throw new NonRetriableError("document vanished");
        await db.update(rfpDocuments).set({ parseStatus: "parsing", parseError: null }).where(eq(rfpDocuments.id, doc.id));
        const parsed = await parseDocument({ fileName: doc.fileName, mime: doc.mime, buffer: await readPrivate(doc.fileUrl) });
        const stored = await putJson(rfpParsedPath(rfpId, doc.id), parsed);
        await db.update(rfpDocuments).set({ parseStatus: "parsed", parsedTextUrl: stored.url, pageCount: parsed.stats.pages ?? parsed.stats.rows ?? null }).where(eq(rfpDocuments.id, doc.id));
        url = stored.url;
        fileName = doc.fileName;
        chunks = countChunks(parsed);
      }
      // Every model call, plus persisting.
      await setJobProgress(jobId, 0, Math.max(1, chunks) + 1);
      return { parsedTextUrl: url, fileName };
    });

    const extracted = await step.run("extract", async (): Promise<{ questions: ExtractedQuestion[]; sections: string[] }> => {
      const parsed = await loadParsed(read.parsedTextUrl);
      const r = await extractParsedDocument(parsed, { knownSections: [], onProgress: () => bumpJobProgress(jobId) });
      let questions = r.questions;
      if (!questions.length && source === "paste") questions = questionsFromLines(parsed.text);
      if (!questions.length) {
        throw new NonRetriableError(source === "paste" ? "No questions found in the paste. Put one question per line and try again." : `No questions found in ${read.fileName}. Upload a questionnaire, or paste the questions instead.`);
      }
      return { questions, sections: r.sections };
    });

    const count = await step.run("persist", async () => {
      const [rfp] = await db.select({ status: rfps.status }).from(rfps).where(eq(rfps.id, rfpId)).limit(1);
      if (!rfp) throw new NonRetriableError("session vanished");
      if (rfp.status !== "parsing") throw new NonRetriableError("questions already written — refusing to overwrite");
      return db.transaction(async (tx) => {
        const written = await persistExtractedQuestions(
          tx,
          rfpId,
          extracted.questions.map((q) => ({ ...q, documentId: documentId ?? null })),
          extracted.sections,
        );
        await tx.update(rfps).set({ status: "questions_ready" }).where(eq(rfps.id, rfpId));
        await bumpJobProgress(jobId);
        await finishJob(jobId, "done");
        return written.questions;
      });
    });

    return { questions: count };
  },
);
