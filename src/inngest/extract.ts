import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db/client";
import { bumpJobProgress, finishJob, markJobRunning, setJobProgress } from "@/db/jobs";
import { listDocumentsForJob } from "@/db/queries/documents";
import { clients, rfps } from "@/db/schema";
import type { ExtractedQuestion } from "@/domain/extraction";
import { writeBrief } from "@/engine/brief";
import { failJob } from "@/lib/jobs";

import { extractRequested, inngest } from "./client";
import { countChunks, extractParsedDocument, persistExtractedQuestions } from "./extract-shared";
import { loadParsed } from "./parse";

interface DocPlan {
  documentId: string;
  kind: string;
  parsedTextUrl: string;
  chunks: number;
}

interface DocResult {
  documentId: string;
  questions: ExtractedQuestion[];
  sections: string[];
  narrative: string;
}

/**
 * Turns every parsed RFP document into questions, writes the context brief,
 * and persists sections + questions for the review step. One durable step
 * per document, so a failed document retries alone; one step for the brief;
 * one transaction to persist.
 */
export const extractQuestions = inngest.createFunction(
  {
    id: "extract-questions",
    retries: 1,
    // A re-delivered event for the same job never starts a second run.
    idempotency: "event.data.jobId",
    // Per-workspace fairness first, then a global ceiling (Inngest's free plan allows 5 concurrent steps in total).
    concurrency: [
      { limit: 2, key: "event.data.workspaceId" },
      { limit: 4 },
    ],
    triggers: [extractRequested],
    onFailure: async ({ event, error }) => {
      await failJob(event.data.event.data.jobId, error, { where: "job:extract", rfpId: event.data.event.data.rfpId });
    },
  },
  async ({ event, step, runId }) => {
    const { rfpId, jobId } = event.data;

    const plan = await step.run("plan", async (): Promise<{ docs: DocPlan[]; pointers: string[] }> => {
      await markJobRunning(jobId, runId);
      const docs = await listDocumentsForJob(rfpId);
      const parsed = docs.filter((d) => d.parseStatus === "parsed" && d.parsedTextUrl);
      if (!parsed.length) throw new NonRetriableError("no parsed documents to extract from");

      const questionDocs: DocPlan[] = [];
      const pointers: string[] = [];
      for (const d of parsed) {
        const doc = await loadParsed(d.parsedTextUrl!);
        if (d.kind === "client_pointers" || d.kind === "our_prior_response" || d.kind === "other") {
          pointers.push(`# ${d.fileName}\n${doc.text.slice(0, 20_000)}`);
          continue;
        }
        questionDocs.push({ documentId: d.id, kind: d.kind, parsedTextUrl: d.parsedTextUrl!, chunks: countChunks(doc) });
      }
      // Chunks + the brief + persisting, so the bar reaches the end only when everything is written.
      await setJobProgress(jobId, 0, questionDocs.reduce((n, d) => n + d.chunks, 0) + 2);
      return { docs: questionDocs, pointers };
    });

    const results: DocResult[] = [];
    let knownSections: string[] = [];
    for (const doc of plan.docs) {
      const result = await step.run(`extract-${doc.documentId}`, async (): Promise<DocResult> => {
        const parsed = await loadParsed(doc.parsedTextUrl);
        const r = await extractParsedDocument(parsed, { knownSections, onProgress: () => bumpJobProgress(jobId) });
        return { documentId: doc.documentId, ...r };
      });
      results.push(result);
      knownSections = result.sections;
    }

    const brief = await step.run("brief", async () => {
      const [rfp] = await db
        .select({ title: rfps.title, clientName: clients.name, industry: clients.industry, headcount: clients.headcount, hq: clients.hqCountry, hrms: clients.currentHrms, group: clients.groupStructure, notes: clients.notes })
        .from(rfps)
        .innerJoin(clients, eq(rfps.clientId, clients.id))
        .where(eq(rfps.id, rfpId))
        .limit(1);
      if (!rfp) throw new NonRetriableError("rfp vanished");
      const all = results.flatMap((r) => r.questions);
      const { brief } = await writeBrief({
        clientName: rfp.clientName,
        clientProfile: { industry: rfp.industry, headcount: rfp.headcount, hqCountry: rfp.hq, currentHrms: rfp.hrms, groupStructure: rfp.group, notes: rfp.notes },
        rfpTitle: rfp.title,
        pointers: plan.pointers,
        narrative: results.map((r) => r.narrative).filter(Boolean).join("\n\n"),
        sampleRequirements: all.filter((_, i) => i % Math.max(1, Math.floor(all.length / 40)) === 0).map((q) => q.questionText),
      });
      await bumpJobProgress(jobId);
      return brief;
    });

    const counts = await step.run("persist", async () => {
      const [rfp] = await db.select({ status: rfps.status }).from(rfps).where(eq(rfps.id, rfpId)).limit(1);
      if (!rfp || !["draft", "parsing"].includes(rfp.status)) throw new NonRetriableError("questions already confirmed — refusing to overwrite");

      const all = results.flatMap((r) => r.questions.map((q) => ({ ...q, documentId: r.documentId })));
      return db.transaction(async (tx) => {
        const written = await persistExtractedQuestions(tx, rfpId, all, knownSections);
        await tx.update(rfps).set({ contextSummary: brief.context_summary }).where(eq(rfps.id, rfpId));
        await bumpJobProgress(jobId);
        await finishJob(jobId, "done");
        return written;
      });
    });

    return counts;
  },
);
