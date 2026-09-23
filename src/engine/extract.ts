import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import {
  NARRATIVE_CHARS_PER_CHUNK,
  ROWS_PER_CHUNK,
  assembleSheetQuestions,
  chunk,
  chunkPages,
  generateRefNo,
  mergeSectionTitles,
  narrativeExtractionSchema,
  normaliseSectionTitle,
  sheetCandidates,
  sheetExtractionSchema,
  type ColumnMap,
  type ExtractedQuestion,
  type SheetExtraction,
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
  /** Where generated ref numbers continue from, so chunks and documents never both produce R-001. */
  startIndex?: number;
  onProgress?: (done: number, total: number) => void | Promise<void>;
}

/**
 * Every call here runs inside one Inngest step, which is one Vercel
 * invocation — capped at 300 s on the Hobby plan, with no way to raise it.
 * The SDK's defaults (600 s, two retries) could blow through that on their
 * own; two attempts of 120 s cannot.
 */
const REQUEST_OPTIONS = { timeout: 120_000, maxRetries: 1 } as const;

/**
 * A spreadsheet row is already a question; the model only classifies it.
 * The requirement text is copied verbatim from the client's cell — never
 * rewritten — and every column of the row is kept in rawMeta.
 */
export async function extractFromSheet(sheet: ParsedSheet, map: ColumnMap, opts: ExtractOptions = {}): Promise<ExtractionResult> {
  if (!map.question) throw new Error(`sheet "${sheet.name}" has no question column`);
  const questionCol = map.question;

  const candidates = sheetCandidates(sheet, questionCol);
  const chunks = chunk(candidates, opts.rowsPerChunk ?? ROWS_PER_CHUNK);
  let knownSections = [...(opts.knownSections ?? [])];
  const modelRows: SheetExtraction["rows"] = [];
  let usage = ZERO_USAGE;

  for (const [i, rows] of chunks.entries()) {
    const payload = rows.map((r) => {
      const extra: Record<string, string> = {};
      if (map.section && r.cells[map.section]) extra.section = r.cells[map.section];
      if (map.priority && r.cells[map.priority]) extra.priority = r.cells[map.priority];
      if (map.acceptanceCriteria && r.cells[map.acceptanceCriteria]) extra.acceptance = r.cells[map.acceptanceCriteria];
      return { source_row: r.row, text: r.cells[questionCol], ...(Object.keys(extra).length ? { extra } : {}) };
    });

    const response = await client.messages.parse(
      {
        model: EXTRACT_MODEL,
        max_tokens: 16_000,
        system: [{ type: "text", text: EXTRACT_SHEET_SYS, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: sheetChunkUserMessage(payload, knownSections) }],
        output_config: { format: zodOutputFormat(sheetExtractionSchema), effort: "medium" },
      },
      REQUEST_OPTIONS,
    );
    usage = addUsage(usage, readUsage(response.usage));
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`extraction chunk ${i + 1}/${chunks.length} returned no parseable output`);

    // Titles found in this chunk are known to the next one's prompt.
    knownSections = mergeSectionTitles(knownSections, parsed.rows.map((r) => r.section_title));
    modelRows.push(...parsed.rows);
    await opts.onProgress?.(i + 1, chunks.length);
  }

  const { questions, sections } = assembleSheetQuestions({ candidates, modelRows, map, knownSections: opts.knownSections ?? [], startIndex: opts.startIndex ?? 0 });
  return { questions, sections, usage, calls: chunks.length };
}

/** Narrative documents: the model finds the questions itself, page-chunked. */
export async function extractFromPages(pages: ParsedPage[], opts: ExtractOptions = {}): Promise<ExtractionResult> {
  const chunks = chunkPages(pages, NARRATIVE_CHARS_PER_CHUNK);
  let knownSections = [...(opts.knownSections ?? [])];
  const questions: ExtractedQuestion[] = [];
  const startIndex = opts.startIndex ?? 0;
  let usage = ZERO_USAGE;

  for (const [i, pageChunk] of chunks.entries()) {
    const response = await client.messages.parse(
      {
        model: EXTRACT_MODEL,
        max_tokens: 16_000,
        system: [{ type: "text", text: EXTRACT_NARRATIVE_SYS, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: narrativeChunkUserMessage(pageChunk, knownSections) }],
        output_config: { format: zodOutputFormat(narrativeExtractionSchema), effort: "medium" },
      },
      REQUEST_OPTIONS,
    );
    usage = addUsage(usage, readUsage(response.usage));
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`narrative extraction chunk ${i + 1}/${chunks.length} returned no parseable output`);

    for (const q of parsed.questions) {
      const title = normaliseSectionTitle(q.section_title);
      knownSections = mergeSectionTitles(knownSections, [title]);
      questions.push({
        sourceRow: null,
        sourcePage: q.source_page,
        refNo: generateRefNo(startIndex + questions.length, q.ref_no),
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
