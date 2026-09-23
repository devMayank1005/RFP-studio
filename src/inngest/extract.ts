import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db/client";
import { finishJob, markJobRunning, setJobProgress } from "@/db/jobs";
import { listDocumentsForJob } from "@/db/queries/documents";
import { clients, rfps } from "@/db/schema";
import { chunk, chunkPages, sheetCandidates, type ColumnMap, type ExtractedQuestion } from "@/domain/extraction";
import { writeBrief } from "@/engine/brief";
import { resolveColumns } from "@/engine/columns";
import { extractFromPages, extractFromSheet } from "@/engine/extract";
import { failJob } from "@/lib/jobs";
import type { ParsedDocument } from "@/lib/parsing";

import { extractRequested, inngest } from "./client";
import { MIN_ROWS_FOR_A_SHEET, NARRATIVE_CHARS_PER_CHUNK, ROWS_PER_CHUNK, persistExtractedQuestions } from "./extract-shared";
import { loadParsed } from "./parse";

/**
 * One model call's worth of work: a run of spreadsheet rows, or a run of
 * narrative pages. Also one durable step — see the function below for why.
 */
interface Unit {
  documentId: string;
  parsedTextUrl: string;
  /** Index into the parsed document's sheets; null for a narrative document. */
  sheetIndex: number | null;
  chunkIndex: number;
  /** Resolved once per sheet in `plan`, so every chunk of a sheet reads the same columns. */
  map: ColumnMap | null;
}

interface Plan {
  units: Unit[];
  /** Pointer documents (client notes, our prior responses), for the brief. */
  pointers: string[];
  /** Parsed-text URLs of the narrative question documents, for the brief. */
  narrativeDocs: string[];
}

interface UnitResult {
  questions: ExtractedQuestion[];
  sections: string[];
}

/**
 * Turns every parsed RFP document into questions, writes the context brief,
 * and persists sections + questions for the review step.
 *
 * ONE DURABLE STEP PER CHUNK, not per document. A step is one HTTP
 * invocation of /api/inngest, and on Vercel's Hobby plan an invocation is
 * capped at 300 s with no way to raise it. A 500-row sheet is ~20 sequential
 * Claude calls — more than 300 s in one step — so Vercel killed the step with
 * a 504, Inngest retried it from chunk 1, and the run died after two attempts
 * with nothing written. Per-chunk steps keep every invocation to one call
 * (~20 s), and a retry re-runs only the chunk that failed.
 *
 * Progress is written as an ABSOLUTE number at the end of each step, never
 * as `+1`: a step Inngest re-runs after the platform killed it must land on
 * the same number, not add to it. That is how the bar once read "33 / 20".
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

    const plan = await step.run("plan", async (): Promise<Plan> => {
      await markJobRunning(jobId, runId);
      const docs = await listDocumentsForJob(rfpId);
      const parsed = docs.filter((d) => d.parseStatus === "parsed" && d.parsedTextUrl);
      if (!parsed.length) throw new NonRetriableError("no parsed documents to extract from");

      const units: Unit[] = [];
      const pointers: string[] = [];
      const narrativeDocs: string[] = [];
      for (const d of parsed) {
        const doc = await loadParsed(d.parsedTextUrl!);
        if (d.kind === "client_pointers" || d.kind === "our_prior_response" || d.kind === "other") {
          pointers.push(`# ${d.fileName}\n${doc.text.slice(0, 20_000)}`);
          continue;
        }
        units.push(...(await planUnits(d.id, d.parsedTextUrl!, doc)));
        if (doc.kind !== "xlsx") narrativeDocs.push(d.parsedTextUrl!);
      }
      // One step per unit, plus the brief and the persist, so the bar reaches the end only when everything is written.
      await setJobProgress(jobId, 0, units.length + 2);
      return { units, pointers, narrativeDocs };
    });

    // Sequential on purpose: the sections found in chunk n are in chunk n+1's
    // prompt, so titles stay consistent across the whole RFP; and generated
    // ref numbers continue across chunks and documents.
    const results: UnitResult[] = [];
    let knownSections: string[] = [];
    let startIndex = 0;
    for (const [i, unit] of plan.units.entries()) {
      const sections = knownSections;
      const from = startIndex;
      const result = await step.run(`extract-${unit.documentId}-${unit.sheetIndex ?? "pages"}-${unit.chunkIndex}`, async (): Promise<UnitResult> => {
        const r = await extractUnit(unit, { knownSections: sections, startIndex: from });
        await setJobProgress(jobId, i + 1);
        return { questions: r.questions, sections: r.sections };
      });
      results.push(result);
      knownSections = result.sections;
      startIndex += result.questions.length;
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
      const narrative = (await Promise.all(plan.narrativeDocs.map((url) => loadParsed(url)))).map((d) => d.text).filter(Boolean).join("\n\n");
      const { brief } = await writeBrief({
        clientName: rfp.clientName,
        clientProfile: { industry: rfp.industry, headcount: rfp.headcount, hqCountry: rfp.hq, currentHrms: rfp.hrms, groupStructure: rfp.group, notes: rfp.notes },
        rfpTitle: rfp.title,
        pointers: plan.pointers,
        narrative,
        sampleRequirements: all.filter((_, i) => i % Math.max(1, Math.floor(all.length / 40)) === 0).map((q) => q.questionText),
      });
      await setJobProgress(jobId, plan.units.length + 1);
      return brief;
    });

    const counts = await step.run("persist", async () => {
      const [rfp] = await db.select({ status: rfps.status }).from(rfps).where(eq(rfps.id, rfpId)).limit(1);
      if (!rfp || !["draft", "parsing"].includes(rfp.status)) throw new NonRetriableError("questions already confirmed — refusing to overwrite");

      const all = plan.units.flatMap((unit, i) => results[i].questions.map((q) => ({ ...q, documentId: unit.documentId })));
      return db.transaction(async (tx) => {
        const written = await persistExtractedQuestions(tx, rfpId, all, knownSections);
        await tx.update(rfps).set({ contextSummary: brief.context_summary }).where(eq(rfps.id, rfpId));
        await setJobProgress(jobId, plan.units.length + 2);
        await finishJob(jobId, "done");
        return written;
      });
    });

    return counts;
  },
);

/** The units a question document costs: one per chunk of candidate rows per sheet, or one per run of narrative pages. */
async function planUnits(documentId: string, parsedTextUrl: string, doc: ParsedDocument): Promise<Unit[]> {
  const units: Unit[] = [];
  if (doc.kind === "xlsx") {
    for (const [sheetIndex, sheet] of (doc.sheets ?? []).entries()) {
      if (sheet.rows.length < MIN_ROWS_FOR_A_SHEET) continue;
      const cols = await resolveColumns(sheet);
      if (!cols.map.hasQuestion || !cols.map.question) continue;
      const chunks = chunk(sheetCandidates(sheet, cols.map.question), ROWS_PER_CHUNK).length;
      for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) units.push({ documentId, parsedTextUrl, sheetIndex, chunkIndex, map: cols.map });
    }
    return units;
  }
  const chunks = chunkPages(doc.pages ?? [], NARRATIVE_CHARS_PER_CHUNK).length;
  for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) units.push({ documentId, parsedTextUrl, sheetIndex: null, chunkIndex, map: null });
  return units;
}

/** One model call: re-reads the parsed document (cheap, from Blob) and extracts exactly this unit's rows or pages. */
async function extractUnit(unit: Unit, opts: { knownSections: string[]; startIndex: number }): Promise<UnitResult> {
  const parsed = await loadParsed(unit.parsedTextUrl);
  if (unit.sheetIndex === null) {
    const pages = chunkPages(parsed.pages ?? [], NARRATIVE_CHARS_PER_CHUNK)[unit.chunkIndex] ?? [];
    const r = await extractFromPages(pages, opts);
    return { questions: r.questions, sections: r.sections };
  }
  const sheet = parsed.sheets?.[unit.sheetIndex];
  if (!sheet || !unit.map?.question) throw new NonRetriableError(`sheet ${unit.sheetIndex} is missing from the parsed document`);
  const rows = chunk(sheetCandidates(sheet, unit.map.question), ROWS_PER_CHUNK)[unit.chunkIndex] ?? [];
  // rowsPerChunk = the whole unit, so this is exactly one call; `|| 1` because chunk(…, 0) never ends.
  const r = await extractFromSheet({ ...sheet, rows }, unit.map, { ...opts, rowsPerChunk: rows.length || 1 });
  return { questions: r.questions, sections: r.sections };
}
