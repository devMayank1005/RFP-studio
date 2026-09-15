import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db/client";
import { bumpJobProgress, finishJob, markJobRunning, setJobProgress } from "@/db/jobs";
import { listDocumentsForJob } from "@/db/queries/documents";
import { clients, rfpQuestions, rfpSections, rfps } from "@/db/schema";
import { chunk, chunkPages, type ExtractedQuestion } from "@/domain/extraction";
import { writeBrief } from "@/engine/brief";
import { resolveColumns } from "@/engine/columns";
import { extractFromPages, extractFromSheet } from "@/engine/extract";
import type { ParsedDocument } from "@/lib/parsing";

import { extractRequested, inngest } from "./client";
import { loadParsed } from "./parse";

const ROWS_PER_CHUNK = 40;
const MIN_ROWS_FOR_A_SHEET = 3;

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
    concurrency: { limit: 2 },
    triggers: [extractRequested],
    onFailure: async ({ event, error }) => {
      await finishJob(event.data.event.data.jobId, "failed", error.message);
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
        const chunks =
          doc.kind === "xlsx"
            ? (doc.sheets ?? []).filter((s) => s.rows.length >= MIN_ROWS_FOR_A_SHEET).reduce((n, s) => n + chunk(s.rows, ROWS_PER_CHUNK).length, 0)
            : chunkPages(doc.pages ?? [], 6_000).length;
        questionDocs.push({ documentId: d.id, kind: d.kind, parsedTextUrl: d.parsedTextUrl!, chunks });
      }
      // Chunks + the brief + persisting, so the bar reaches the end only when everything is written.
      await setJobProgress(jobId, 0, questionDocs.reduce((n, d) => n + d.chunks, 0) + 2);
      return { docs: questionDocs, pointers };
    });

    const results: DocResult[] = [];
    let knownSections: string[] = [];
    for (const doc of plan.docs) {
      const result = await step.run(`extract-${doc.documentId}`, async (): Promise<DocResult> => {
        const parsed: ParsedDocument = await loadParsed(doc.parsedTextUrl);
        const questions: ExtractedQuestion[] = [];
        let sections = [...knownSections];
        let narrative = "";

        if (parsed.kind === "xlsx") {
          for (const sheet of (parsed.sheets ?? []).filter((s) => s.rows.length >= MIN_ROWS_FOR_A_SHEET)) {
            const cols = await resolveColumns(sheet);
            if (!cols.map.hasQuestion) continue;
            const r = await extractFromSheet(sheet, cols.map, {
              knownSections: sections,
              onProgress: () => bumpJobProgress(jobId),
            });
            questions.push(...r.questions);
            sections = r.sections;
          }
        } else {
          narrative = parsed.text;
          const r = await extractFromPages(parsed.pages ?? [], {
            knownSections: sections,
            onProgress: () => bumpJobProgress(jobId),
          });
          questions.push(...r.questions);
          sections = r.sections;
        }
        return { documentId: doc.documentId, questions, sections, narrative };
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
        await tx.delete(rfpQuestions).where(eq(rfpQuestions.rfpId, rfpId));
        await tx.delete(rfpSections).where(eq(rfpSections.rfpId, rfpId));

        const sectionIds = new Map<string, string>();
        for (const [i, title] of knownSections.entries()) {
          const [s] = await tx.insert(rfpSections).values({ rfpId, title, sortOrder: i }).returning({ id: rfpSections.id });
          sectionIds.set(title.toLowerCase(), s.id);
        }
        // Re-number across documents so refs stay unique when two sheets both start at 1.
        const seen = new Set<string>();
        const rows = all.map((q, i) => {
          let refNo = q.refNo;
          if (seen.has(refNo)) refNo = `${refNo}·${i + 1}`;
          seen.add(refNo);
          return {
            rfpId,
            sectionId: sectionIds.get(q.sectionTitle.toLowerCase()) ?? null,
            refNo,
            questionText: q.questionText,
            acceptanceCriteria: q.acceptanceCriteria,
            questionType: q.questionType,
            isMandatory: q.isMandatory,
            owner: q.owner,
            moduleHint: q.moduleHint,
            rawMeta: q.rawMeta,
            existingAnswer: q.existing && (q.existing.answer || q.existing.compliance || q.existing.questions) ? q.existing : null,
            sourceDocumentId: q.documentId,
            sourceRow: q.sourceRow ?? q.sourcePage,
            sortOrder: i,
          };
        });
        for (const batch of chunk(rows, 200)) await tx.insert(rfpQuestions).values(batch);

        await tx.update(rfps).set({ contextSummary: brief.context_summary }).where(eq(rfps.id, rfpId));
        await bumpJobProgress(jobId);
        await finishJob(jobId, "done");
        return { questions: rows.length, sections: knownSections.length, withExisting: rows.filter((r) => r.existingAnswer).length };
      });
    });

    return counts;
  },
);
