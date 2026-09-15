import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import {
  chunk,
  chunkPages,
  generateRefNo,
  mapExistingCompliance,
  mapPriority,
  narrativeExtractionSchema,
  normaliseSectionTitle,
  sheetExtractionSchema,
  type ColumnMap,
  type ExtractedQuestion,
} from "@/domain/extraction";
import type { ParsedPage, ParsedSheet } from "@/lib/parsing";

import {
  EXTRACT_NARRATIVE_SYS,
  EXTRACT_SHEET_SYS,
  narrativeChunkUserMessage,
  sheetChunkUserMessage,
} from "../../prompts/extract";

import { EXTRACT_MODEL, ZERO_USAGE, addUsage, client, readUsage, type UsageReport } from "./client";

export interface ExtractionResult {
  questions: ExtractedQuestion[];
  sections: string[];
  usage: UsageReport;
  calls: number;
}

export interface ExtractOptions {
  /** Sections already known for this RFP (from earlier documents), so titles stay consistent. */
  knownSections?: string[];
  rowsPerChunk?: number;
  onProgress?: (done: number, total: number) => void | Promise<void>;
}

const ROWS_PER_CHUNK = 40;
const NARRATIVE_CHARS_PER_CHUNK = 6_000;

/**
 * A spreadsheet row is already a question; the model only classifies it.
 * The requirement text is copied verbatim from the client's cell — never
 * rewritten — and every column of the row is kept in rawMeta.
 */
export async function extractFromSheet(sheet: ParsedSheet, map: ColumnMap, opts: ExtractOptions = {}): Promise<ExtractionResult> {
  if (!map.question) throw new Error(`sheet "${sheet.name}" has no question column`);
  const questionCol = map.question;

  const candidates = sheet.rows.filter((r) => (r.cells[questionCol] ?? "").trim().length > 0);
  const chunks = chunk(candidates, opts.rowsPerChunk ?? ROWS_PER_CHUNK);
  const knownSections = [...(opts.knownSections ?? [])];
  const classified = new Map<number, { is_question: boolean; section_title: string; question_type: ExtractedQuestion["questionType"]; module_hint: ExtractedQuestion["moduleHint"]; owner_guess: ExtractedQuestion["owner"] }>();
  let usage = ZERO_USAGE;

  for (const [i, rows] of chunks.entries()) {
    const payload = rows.map((r) => {
      const extra: Record<string, string> = {};
      if (map.section && r.cells[map.section]) extra.section = r.cells[map.section];
      if (map.priority && r.cells[map.priority]) extra.priority = r.cells[map.priority];
      if (map.acceptanceCriteria && r.cells[map.acceptanceCriteria]) extra.acceptance = r.cells[map.acceptanceCriteria];
      return { source_row: r.row, text: r.cells[questionCol], ...(Object.keys(extra).length ? { extra } : {}) };
    });

    const response = await client.messages.parse({
      model: EXTRACT_MODEL,
      max_tokens: 16_000,
      system: [{ type: "text", text: EXTRACT_SHEET_SYS, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: sheetChunkUserMessage(payload, knownSections) }],
      output_config: { format: zodOutputFormat(sheetExtractionSchema), effort: "medium" },
    });
    usage = addUsage(usage, readUsage(response.usage));
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`extraction chunk ${i + 1}/${chunks.length} returned no parseable output`);

    for (const row of parsed.rows) {
      const title = normaliseSectionTitle(row.section_title);
      if (!knownSections.some((s) => s.toLowerCase() === title.toLowerCase())) knownSections.push(title);
      classified.set(row.source_row, { ...row, section_title: title });
    }
    await opts.onProgress?.(i + 1, chunks.length);
  }

  const questions: ExtractedQuestion[] = [];
  let index = 0;
  for (const r of candidates) {
    const c = classified.get(r.row);
    // A row the model did not return is still a question — default it rather than drop it.
    if (c && !c.is_question) continue;
    const sectionFromSheet = map.section ? normaliseSectionTitle(r.cells[map.section]) : null;
    questions.push({
      sourceRow: r.row,
      sourcePage: null,
      refNo: generateRefNo(index, map.refNo ? r.cells[map.refNo] : null),
      sectionTitle: c?.section_title ?? sectionFromSheet ?? "General",
      questionText: r.cells[questionCol].trim(),
      acceptanceCriteria: map.acceptanceCriteria ? (r.cells[map.acceptanceCriteria]?.trim() ?? null) : null,
      questionType: c?.question_type ?? "descriptive",
      isMandatory: mapPriority(map.priority ? r.cells[map.priority] : null),
      owner: c?.owner_guess && c.owner_guess !== "not_applicable" ? c.owner_guess : "joint",
      moduleHint: c?.module_hint ?? "general",
      rawMeta: { ...r.cells },
      existing:
        map.existingCompliance || map.existingAnswer || map.existingQuestions
          ? {
              compliance: mapExistingCompliance(map.existingCompliance ? r.cells[map.existingCompliance] : null),
              answer: map.existingAnswer ? (r.cells[map.existingAnswer]?.trim() ?? null) : null,
              questions: map.existingQuestions ? (r.cells[map.existingQuestions]?.trim() ?? null) : null,
            }
          : null,
    });
    index++;
  }

  return { questions, sections: knownSections, usage, calls: chunks.length };
}

/** Narrative documents: the model finds the questions itself, page-chunked. */
export async function extractFromPages(pages: ParsedPage[], opts: ExtractOptions = {}): Promise<ExtractionResult> {
  const chunks = chunkPages(pages, NARRATIVE_CHARS_PER_CHUNK);
  const knownSections = [...(opts.knownSections ?? [])];
  const questions: ExtractedQuestion[] = [];
  let usage = ZERO_USAGE;

  for (const [i, pageChunk] of chunks.entries()) {
    const response = await client.messages.parse({
      model: EXTRACT_MODEL,
      max_tokens: 16_000,
      system: [{ type: "text", text: EXTRACT_NARRATIVE_SYS, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: narrativeChunkUserMessage(pageChunk, knownSections) }],
      output_config: { format: zodOutputFormat(narrativeExtractionSchema), effort: "medium" },
    });
    usage = addUsage(usage, readUsage(response.usage));
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`narrative extraction chunk ${i + 1}/${chunks.length} returned no parseable output`);

    for (const q of parsed.questions) {
      const title = normaliseSectionTitle(q.section_title);
      if (!knownSections.some((s) => s.toLowerCase() === title.toLowerCase())) knownSections.push(title);
      questions.push({
        sourceRow: null,
        sourcePage: q.source_page,
        refNo: generateRefNo(questions.length, q.ref_no),
        sectionTitle: title,
        questionText: q.question_text.trim(),
        acceptanceCriteria: null,
        questionType: q.question_type,
        isMandatory: q.is_mandatory,
        owner: q.owner_guess === "not_applicable" ? "joint" : q.owner_guess,
        moduleHint: q.module_hint,
        rawMeta: { Page: String(q.source_page), ...(q.ref_no ? { Ref: q.ref_no } : {}) },
        existing: null,
      });
    }
    await opts.onProgress?.(i + 1, chunks.length);
  }

  return { questions, sections: knownSections, usage, calls: chunks.length };
}
