import { deepenHex, normaliseHex } from "./brand";
import { sortChroRows, type ChroRowLike } from "./chro";
import { formatDate, todayInKolkata } from "./dates";
import {
  CHRO_THEME_LABEL,
  COMPLIANCE_LABEL,
  COMPLIANCE_LEVELS,
  ENGAGEMENT_TYPE_LABEL,
  OWNER_LABEL,
  RESPONSE_STATUS_LABEL,
  type Bidder,
  type ChroStatus,
  type ChroTheme,
  type CitationSource,
  type Compliance,
  type EngagementType,
  type ExportFormat,
  type Module,
  type Owner,
  type QuestionType,
  type ResponseStatus,
  type RfpStatus,
} from "./enums";
import { guessColumnRoles } from "./extraction";
import { stripCitationMarkers } from "./drafting";

/**
 * Exports, the pure half. Given an RFP's questions, answers, sources and the
 * client's parsed workbook, this decides what an Excel or Word export
 * contains and where every value goes: section and column order, how the
 * client's own sheet is filled in, file names, readiness counts and the Word
 * outline. Byte generation (ExcelJS, docx) lives in src/lib/export and only
 * follows these plans.
 */

// ---- Formats and options ----

export type ExportShape = "fresh" | "fill";
export const EXPORT_SHAPES = ["fresh", "fill"] as const;

export type ExportOptions = { approvedOnly?: boolean; shape?: ExportShape };
export const DEFAULT_EXPORT_OPTIONS: Required<ExportOptions> = { approvedOnly: false, shape: "fresh" };

export function normaliseExportOptions(input: ExportOptions | null | undefined): Required<ExportOptions> {
  return {
    approvedOnly: input?.approvedOnly === true,
    shape: input?.shape === "fill" ? "fill" : "fresh",
  };
}

export interface ExportFormatMeta {
  label: string;
  extension: string;
  contentType: string;
  /** False until a renderer exists (the deck is a later milestone). */
  available: boolean;
  /** Needs the Claude key (the Word export writes an executive summary). */
  needsEngine: boolean;
  /** progress_total for the job. */
  steps: number;
}

export const EXPORT_FORMAT_META: Record<ExportFormat, ExportFormatMeta> = {
  xlsx: { label: "Excel", extension: "xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", available: true, needsEngine: false, steps: 3 },
  docx: { label: "Word", extension: "docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", available: true, needsEngine: true, steps: 4 },
  pptx: { label: "Deck", extension: "pptx", contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", available: false, needsEngine: false, steps: 3 },
};

// ---- Source rows (what the query layer hands over) ----

export interface ExportSourceQuestion {
  id: string;
  refNo: string;
  questionText: string;
  acceptanceCriteria: string | null;
  questionType: QuestionType;
  isMandatory: boolean;
  owner: Owner;
  moduleHint: Module;
  /** The client's own columns, verbatim, keyed by header. */
  rawMeta: Record<string, string>;
  sortOrder: number;
  sectionId: string | null;
  sourceDocumentId: string | null;
  /** 1-based sheet row for spreadsheet sources; a page number for narrative ones. */
  sourceRow: number | null;
  status: ResponseStatus | null;
  compliance: Compliance | null;
  flagReason: string | null;
  answerText: string | null;
  openPoints: string[];
  revisionId: string | null;
}

export interface ExportSourceCitation {
  revisionId: string;
  ordinal: number;
  sourceType: CitationSource;
  title: string | null;
  excerpt: string;
}

/** One parsed worksheet of an uploaded RFP, as the parser stored it. */
export interface ExportSheet {
  documentId: string;
  name: string;
  headerRow: number;
  headers: string[];
  rows: Array<{ row: number; cells: Record<string, string> }>;
}

export interface ExportSource {
  rfp: {
    id: string;
    title: string;
    engagementType: EngagementType;
    bidderOfRecord: Bidder;
    status: RfpStatus;
    dueDate: string | null;
    contextSummary: string | null;
  };
  client: { name: string; industry: string | null; hqCountry: string | null; headcount: number | null; currentHrms: string | null };
  sections: Array<{ id: string; title: string; sortOrder: number }>;
  questions: ExportSourceQuestion[];
  citations: ExportSourceCitation[];
  chro: Array<ChroRowLike & { questionText: string; rationale: string; status: ChroStatus }>;
  sheets: ExportSheet[];
  /** ISO timestamp of the build. */
  generatedAt: string;
}

// ---- The model every renderer reads ----

export interface ExportSourceRef {
  ordinal: number;
  title: string;
  sourceType: CitationSource;
}

export interface ExportAnswer {
  status: ResponseStatus;
  compliance: Compliance | null;
  text: string;
  openPoints: string[];
  sources: ExportSourceRef[];
  flagReason: string | null;
}

export interface ExportQuestion {
  id: string;
  refNo: string;
  questionText: string;
  acceptanceCriteria: string | null;
  questionType: QuestionType;
  isMandatory: boolean;
  owner: Owner;
  moduleHint: Module;
  rawMeta: Record<string, string>;
  sortOrder: number;
  sectionId: string | null;
  sectionTitle: string;
  sourceDocumentId: string | null;
  sourceRow: number | null;
  answer: ExportAnswer | null;
}

export interface ExportSection {
  id: string | null;
  title: string;
  questions: ExportQuestion[];
}

export interface ExportReadiness {
  total: number;
  drafted: number;
  approved: number;
  unapproved: number;
  flagged: number;
  notDrafted: number;
}

export interface ExportModel {
  rfp: ExportSource["rfp"];
  client: ExportSource["client"];
  sections: ExportSection[];
  questions: ExportQuestion[];
  clientColumns: string[];
  chro: Array<{ theme: ChroTheme; questionText: string; rationale: string }>;
  sheets: ExportSheet[];
  readiness: ExportReadiness;
  complianceCounts: Record<Compliance, number>;
  options: Required<ExportOptions>;
  generatedAt: string;
  /** "16 Sep 2026", in India's calendar. */
  generatedOn: string;
}

export const OTHER_SECTION_TITLE = "Other requirements";

const SOURCE_FALLBACK: Record<CitationSource, string> = {
  kb_entry: "Knowledge base",
  approved_answer: "Approved answer",
  rfp_document: "RFP document",
};

export function buildExportModel(source: ExportSource, options?: ExportOptions): ExportModel {
  const opts = normaliseExportOptions(options);
  const sectionTitle = new Map(source.sections.map((s) => [s.id, s.title]));
  const citationsByRevision = new Map<string, ExportSourceRef[]>();
  for (const c of source.citations) {
    const list = citationsByRevision.get(c.revisionId) ?? [];
    list.push({ ordinal: c.ordinal, title: c.title?.trim() || SOURCE_FALLBACK[c.sourceType], sourceType: c.sourceType });
    citationsByRevision.set(c.revisionId, list);
  }

  const questions: ExportQuestion[] = [...source.questions]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((q) => {
      const { status, compliance, flagReason, answerText, openPoints, revisionId, ...rest } = q;
      let answer: ExportAnswer | null = null;
      if (status) {
        const hidden = opts.approvedOnly && status !== "approved";
        const sources = (revisionId ? citationsByRevision.get(revisionId) ?? [] : []).sort((a, b) => a.ordinal - b.ordinal);
        answer = {
          status,
          compliance,
          text: hidden ? "" : stripCitationMarkers(answerText ?? ""),
          openPoints: hidden ? [] : openPoints.filter((p) => p.trim().length > 0),
          sources: hidden ? [] : sources,
          flagReason: flagReason?.trim() || null,
        };
      }
      return { ...rest, sectionTitle: (q.sectionId && sectionTitle.get(q.sectionId)) || OTHER_SECTION_TITLE, answer };
    });

  const sections: ExportSection[] = [...source.sections]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => ({ id: s.id, title: s.title, questions: questions.filter((q) => q.sectionId === s.id) }));
  const orphans = questions.filter((q) => !q.sectionId || !sectionTitle.has(q.sectionId));
  if (orphans.length) sections.push({ id: null, title: OTHER_SECTION_TITLE, questions: orphans });

  const kept = sortChroRows(source.chro.filter((c) => c.status === "kept"));

  return {
    rfp: source.rfp,
    client: source.client,
    sections: sections.filter((s) => s.questions.length > 0 || s.id !== null),
    questions,
    clientColumns: clientColumnOrder(
      source.sheets.map((s) => s.headers),
      questions.map((q) => q.rawMeta),
    ),
    chro: kept.map((c) => ({ theme: c.theme, questionText: c.questionText, rationale: c.rationale })),
    sheets: source.sheets,
    readiness: exportReadiness(questions.map((q) => ({ status: q.answer?.status ?? null }))),
    complianceCounts: complianceCounts(questions.map((q) => ({ compliance: q.answer?.compliance ?? null }))),
    options: opts,
    generatedAt: source.generatedAt,
    generatedOn: formatDate(todayInKolkata(new Date(source.generatedAt))),
  };
}

// ---- Counts ----

export function exportReadiness(rows: ReadonlyArray<{ status: ResponseStatus | null }>): ExportReadiness {
  let drafted = 0;
  let approved = 0;
  let flagged = 0;
  for (const r of rows) {
    if (r.status) drafted += 1;
    if (r.status === "approved") approved += 1;
    if (r.status === "flagged") flagged += 1;
  }
  return { total: rows.length, drafted, approved, unapproved: rows.length - approved, flagged, notDrafted: rows.length - drafted };
}

export function complianceCounts(rows: ReadonlyArray<{ compliance: Compliance | null }>): Record<Compliance, number> {
  const counts = Object.fromEntries(COMPLIANCE_LEVELS.map((c) => [c, 0])) as Record<Compliance, number>;
  for (const r of rows) if (r.compliance) counts[r.compliance] += 1;
  return counts;
}

// ---- Fresh workbook: the client's columns, then ours ----

/**
 * The client's headers in the client's own order. A sheet counts when at
 * least one question's raw_meta keys all belong to it; headers nobody filled
 * (their empty "Vendor Response" column) still come along. Keys from
 * narrative sources ({ Page, Ref }) or unknown sheets follow in the order
 * they first appear.
 */
export function clientColumnOrder(sheetHeaders: readonly (readonly string[])[], rawMetas: readonly Record<string, string>[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const push = (h: string) => {
    if (!seen.has(h)) {
      seen.add(h);
      order.push(h);
    }
  };
  const keySets = rawMetas.map((m) => Object.keys(m)).filter((keys) => keys.length > 0);
  for (const headers of sheetHeaders) {
    const set = new Set(headers);
    if (keySets.some((keys) => keys.every((k) => set.has(k)))) headers.forEach(push);
  }
  for (const keys of keySets) keys.forEach(push);
  return order;
}

export type KognozField = "ref" | "section" | "compliance" | "response" | "status" | "owner" | "openPoints" | "sources";

export const KOGNOZ_COLUMNS: ReadonlyArray<{ field: KognozField; header: string; width: number }> = [
  { field: "ref", header: "Ref", width: 10 },
  { field: "section", header: "Section", width: 22 },
  { field: "compliance", header: "Compliance", width: 16 },
  { field: "response", header: "Response", width: 70 },
  { field: "status", header: "Status", width: 12 },
  { field: "owner", header: "Owner", width: 12 },
  { field: "openPoints", header: "Open points", width: 40 },
  { field: "sources", header: "Sources", width: 40 },
];

export interface XlsxColumn {
  key: string;
  header: string;
  width: number;
  kind: "client" | "kognoz";
  field?: KognozField;
}

/** Excel column width in characters, from the header and a sample of values; clamped so nothing is unreadable or absurd. */
export function columnWidth(header: string, samples: readonly string[]): number {
  const lengths = samples.map((s) => longestLine(s)).sort((a, b) => a - b);
  const p90 = lengths.length ? lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * 0.9))] : 0;
  const want = Math.max(header.length + 2, Math.ceil(p90 / 1.1));
  return Math.min(60, Math.max(12, want));
}

function longestLine(s: string): number {
  return s.split(/\r?\n/).reduce((m, l) => Math.max(m, l.length), 0);
}

export function xlsxColumnPlan(model: ExportModel): XlsxColumn[] {
  const taken = new Set(model.clientColumns.map((h) => h.trim().toLowerCase()));
  const client: XlsxColumn[] = model.clientColumns.map((header, i) => ({
    key: `c:${i}`,
    header,
    width: columnWidth(
      header,
      model.questions.map((q) => q.rawMeta[header] ?? ""),
    ),
    kind: "client",
  }));
  const ours: XlsxColumn[] = KOGNOZ_COLUMNS.map((c) => ({
    key: `k:${c.field}`,
    header: taken.has(c.header.toLowerCase()) ? `Kognoz ${c.header}` : c.header,
    width: c.width,
    kind: "kognoz",
    field: c.field,
  }));
  return [...client, ...ours];
}

export const NOT_DRAFTED_LABEL = "Not drafted";

export function xlsxRowValues(q: ExportQuestion, plan: readonly XlsxColumn[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of plan) {
    if (col.kind === "client") {
      out[col.key] = q.rawMeta[col.header] ?? "";
      continue;
    }
    switch (col.field) {
      case "ref":
        out[col.key] = q.refNo;
        break;
      case "section":
        out[col.key] = q.sectionTitle;
        break;
      case "compliance":
        out[col.key] = q.answer?.compliance ? COMPLIANCE_LABEL[q.answer.compliance] : "";
        break;
      case "response":
        out[col.key] = q.answer?.text ?? "";
        break;
      case "status":
        out[col.key] = q.answer ? RESPONSE_STATUS_LABEL[q.answer.status] : NOT_DRAFTED_LABEL;
        break;
      case "owner":
        out[col.key] = OWNER_LABEL[q.owner];
        break;
      case "openPoints":
        out[col.key] = (q.answer?.openPoints ?? []).map((p) => `• ${p}`).join("\n");
        break;
      case "sources":
        out[col.key] = formatSources(q.answer?.sources ?? []) ?? "";
        break;
    }
  }
  return out;
}

export function formatSources(sources: readonly ExportSourceRef[]): string | null {
  return sources.length ? sources.map((s) => `[${s.ordinal}] ${s.title}`).join("; ") : null;
}

export function xlsxSummaryRows(model: ExportModel, footerText: string | null): Array<[string, string]> {
  const r = model.readiness;
  const byStatus = (status: ResponseStatus) => model.questions.filter((q) => q.answer?.status === status).length;
  const rows: Array<[string, string]> = [
    ["RFP", model.rfp.title],
    ["Client", model.client.name],
    ["Engagement", ENGAGEMENT_TYPE_LABEL[model.rfp.engagementType]],
    ["Due date", model.rfp.dueDate ? formatDate(model.rfp.dueDate) : "—"],
    ["Generated", model.generatedOn],
    ["Questions", String(r.total)],
    ["Approved", String(r.approved)],
    ["Edited", String(byStatus("edited"))],
    ["AI draft", String(byStatus("ai_draft"))],
    ["Flagged", String(r.flagged)],
    [NOT_DRAFTED_LABEL, String(r.notDrafted)],
    ...COMPLIANCE_LEVELS.map((c): [string, string] => [COMPLIANCE_LABEL[c], String(model.complianceCounts[c])]),
    ["Answers included", model.options.approvedOnly ? "Approved answers only" : "All answers, status marked"],
  ];
  if (footerText?.trim()) rows.push(["", footerText.trim()]);
  return rows;
}

// ---- Filling the client's workbook ----

export interface RowMatch {
  sheetName: string;
  row: number;
}

export interface MatchResult {
  matches: Record<string, RowMatch>;
  unmatched: Array<{ questionId: string; refNo: string; reason: string }>;
  /** "<sheet>:<row>" → question ids (in order) when several questions share one row, i.e. a split. */
  shared: Record<string, string[]>;
}

function normText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

const MIN_OVERLAP_CHARS = 20;

/**
 * Where each question came from in the client's workbook. The stored row
 * number carries no sheet name, so the sheet is the one whose row holds the
 * question's text: equal (extracted as is), containing it (a split part) or
 * contained in it (a merge keeps its first row). A row shared by several
 * questions is reported so the renderer can write them as one lettered cell.
 */
export function matchQuestionsToRows(questions: readonly ExportQuestion[], sheets: readonly ExportSheet[]): MatchResult {
  const matches: Record<string, RowMatch> = {};
  const unmatched: MatchResult["unmatched"] = [];
  const shared: Record<string, string[]> = {};

  for (const q of questions) {
    if (q.sourceRow === null || sheets.length === 0) {
      unmatched.push({ questionId: q.id, refNo: q.refNo, reason: "no spreadsheet row recorded" });
      continue;
    }
    const candidates = sheets.filter((s) => (!q.sourceDocumentId || s.documentId === q.sourceDocumentId) && s.rows.some((r) => r.row === q.sourceRow));
    if (candidates.length === 0) {
      unmatched.push({ questionId: q.id, refNo: q.refNo, reason: `row ${q.sourceRow} is not in the parsed workbook` });
      continue;
    }
    const text = normText(q.questionText);
    const scored = candidates.map((sheet) => {
      const row = sheet.rows.find((r) => r.row === q.sourceRow)!;
      const cells = Object.values(row.cells).map(normText).filter((c) => c.length > 0);
      let score = 0;
      if (cells.some((c) => c === text)) score = 3;
      else if (cells.some((c) => c.length >= MIN_OVERLAP_CHARS && text.includes(c))) score = 2;
      else if (text.length >= MIN_OVERLAP_CHARS && cells.some((c) => c.includes(text))) score = 2;
      else {
        const entries = Object.entries(q.rawMeta).filter(([, v]) => v.trim().length > 0);
        const hits = entries.filter(([k, v]) => normText(row.cells[k] ?? "") === normText(v)).length;
        if (entries.length > 0 && hits / entries.length >= 0.8) score = 2;
      }
      return { sheet, score };
    });
    const best = Math.max(...scored.map((s) => s.score));
    const winners = scored.filter((s) => s.score === best && best > 0);
    if (winners.length !== 1) {
      unmatched.push({ questionId: q.id, refNo: q.refNo, reason: winners.length ? "several sheets carry this row" : "row text differs from the question" });
      continue;
    }
    const match = { sheetName: winners[0].sheet.name, row: q.sourceRow };
    matches[q.id] = match;
    const key = `${match.sheetName}:${match.row}`;
    (shared[key] ??= []).push(q.id);
  }
  for (const key of Object.keys(shared)) if (shared[key].length < 2) delete shared[key];
  return { matches, unmatched, shared };
}

export type FillTarget = "response" | "compliance" | "remarks";

export interface FillPlan {
  /** The client's own column for our answer (e.g. "Solution"), or null when we must add one. */
  answer: string | null;
  compliance: string | null;
  remarks: string | null;
  /** A "Questions to the client" style column, when the client provided one: open points go there. */
  questions: string | null;
  append: Array<{ field: FillTarget; header: string }>;
}

export const APPENDED_HEADER: Record<FillTarget, string> = {
  response: "Kognoz response",
  compliance: "Kognoz compliance",
  remarks: "Kognoz remarks",
};

/** Which of the client's columns take our answer, compliance and remarks; anything missing is appended after their last column. */
export function fillColumnPlan(headers: readonly string[]): FillPlan {
  const roles = guessColumnRoles([...headers]);
  const first = (role: string) => headers.find((h) => roles[h] === role) ?? null;
  const answer = first("existing_answer");
  const compliance = first("existing_compliance");
  const remarks = first("remarks");
  const questions = first("existing_questions");
  const append: FillPlan["append"] = [];
  if (!answer) append.push({ field: "response", header: APPENDED_HEADER.response });
  if (!compliance) append.push({ field: "compliance", header: APPENDED_HEADER.compliance });
  if (!remarks) append.push({ field: "remarks", header: APPENDED_HEADER.remarks });
  return { answer, compliance, remarks, questions, append };
}

export interface FillCell {
  text: string;
  compliance: string;
  /** Flag reasons, plus the open points unless they have a column of their own. */
  remarks: string;
  /** Open points, when the client's sheet has a questions column. */
  questions: string;
  /** Status labels of the answers that are not approved, for the cell note. */
  unapproved: string[];
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/**
 * The cell values for one client row; several questions on a row (a split)
 * become lettered blocks. With `separateQuestions` the open points go to the
 * client's own questions column instead of remarks.
 */
export function fillCellValues(questions: readonly ExportQuestion[], opts: { separateQuestions?: boolean } = {}): FillCell {
  const many = questions.length > 1;
  const tag = (i: number, s: string) => (many && s ? `(${LETTERS[i] ?? i + 1}) ${s}` : s);
  const parts = questions.map((q, i) => ({
    text: tag(i, q.answer?.text ?? ""),
    compliance: tag(i, q.answer?.compliance ? COMPLIANCE_LABEL[q.answer.compliance] : ""),
    remarks: tag(i, remarksFor(q, !opts.separateQuestions)),
    questions: tag(i, opts.separateQuestions ? (q.answer?.openPoints ?? []).join("\n") : ""),
    unapproved: q.answer && q.answer.status !== "approved" ? RESPONSE_STATUS_LABEL[q.answer.status] : null,
  }));
  const join = (key: "text" | "compliance" | "remarks" | "questions", sep: string) =>
    parts
      .map((p) => p[key])
      .filter((s) => s.length > 0)
      .join(sep);
  return {
    text: join("text", "\n\n"),
    compliance: join("compliance", "; "),
    remarks: join("remarks", "\n"),
    questions: join("questions", "\n"),
    unapproved: parts.map((p) => p.unapproved).filter((s): s is string => s !== null),
  };
}

function remarksFor(q: ExportQuestion, withOpenPoints: boolean): string {
  const lines = withOpenPoints ? [...(q.answer?.openPoints ?? [])] : [];
  if (q.answer?.flagReason) lines.push(`Flagged: ${q.answer.flagReason}`);
  return lines.join("\n");
}

// ---- File names ----

/** Lower-case ASCII words joined by hyphens, cut at a word boundary so no word is left half-written. */
function slug(input: string, max = 60): string {
  const words = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0);
  const out: string[] = [];
  for (const w of words) {
    if (out.length && [...out, w].join("-").length > max) break;
    out.push(w);
  }
  return out.join("-").slice(0, max);
}

export function exportFileName(input: { clientName: string; rfpTitle: string; format: ExportFormat; date: string; shape?: ExportShape; originalName?: string | null }): string {
  const ext = EXPORT_FORMAT_META[input.format].extension;
  if (input.shape === "fill" && input.originalName) {
    const stem = slug(input.originalName.replace(/\.[A-Za-z0-9]+$/, ""), 60) || "rfp";
    return `${stem}-kognoz-response-${input.date}.${ext}`;
  }
  const strip = (s: string) => s.replace(/\((demo|test)\)/gi, "");
  const client = slug(strip(input.clientName), 30);
  const title = slug(strip(input.rfpTitle), 60);
  // The title usually opens with the client's name; say it once.
  const parts = [client, client && title.startsWith(client) ? title.slice(client.length).replace(/^-+/, "") : title].filter((p) => p.length > 0);
  const stem = parts.length ? parts.join("-") : "rfp";
  return `${stem}-response-${input.date}.${ext}`.slice(0, 120);
}

/** RFC 6266 / 5987: an ASCII fallback plus the UTF-8 form, so every browser saves the right name. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

// ---- Word outline ----

export type AnswerBlock = { kind: "paragraph"; text: string } | { kind: "bullets"; items: string[] };

const BULLET = /^\s*(?:[-•*]|\d+[.)])\s+/;

/** Blank-line separated paragraphs; a paragraph whose every line is a list item becomes bullets. */
export function answerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  for (const chunk of text.split(/\r?\n\s*\r?\n/)) {
    const lines = chunk
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (!lines.length) continue;
    if (lines.every((l) => BULLET.test(l))) blocks.push({ kind: "bullets", items: lines.map((l) => l.replace(BULLET, "")) });
    else blocks.push({ kind: "paragraph", text: lines.join(" ") });
  }
  return blocks;
}

export interface ExecutiveSummary {
  paragraphs: string[];
  highlights: string[];
}

export type DocxNode =
  | { kind: "cover"; title: string; client: string; date: string; footerText: string | null; readiness: ExportReadiness }
  | { kind: "heading"; level: 1 | 2; text: string; pageBreakBefore?: boolean }
  | { kind: "summary"; paragraphs: string[]; highlights: string[] }
  | { kind: "overview"; rows: Array<[string, string]> }
  | {
      kind: "question";
      refNo: string;
      question: string;
      meta: string;
      compliance: Compliance | null;
      status: ResponseStatus | null;
      blocks: AnswerBlock[];
      sources: string | null;
      openPoints: string[];
      flagReason: string | null;
    }
  | { kind: "chro"; theme: ChroTheme; questions: Array<{ text: string; rationale: string }> }
  | { kind: "paragraph"; text: string; muted?: boolean };

export const CHRO_APPENDIX_TITLE = "Appendix: questions for the CHRO conversation";

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function overviewRows(model: ExportModel): Array<[string, string]> {
  const r = model.readiness;
  const compliance = COMPLIANCE_LEVELS.filter((c) => model.complianceCounts[c] > 0)
    .map((c) => `${COMPLIANCE_LABEL[c]} ${model.complianceCounts[c]}`)
    .join(" · ");
  return [
    ["Client", model.client.name],
    ["Engagement", ENGAGEMENT_TYPE_LABEL[model.rfp.engagementType]],
    ["Bidder of record", titleCase(model.rfp.bidderOfRecord)],
    ["Due date", model.rfp.dueDate ? formatDate(model.rfp.dueDate) : "—"],
    ["Questions answered", `${r.drafted} of ${r.total}`],
    ["Approved", `${r.approved} of ${r.total}`],
    ["Compliance", compliance || "—"],
  ];
}

export function docxOutline(model: ExportModel, summary: ExecutiveSummary | null, footerText: string | null = null): DocxNode[] {
  const nodes: DocxNode[] = [];
  nodes.push({ kind: "cover", title: model.rfp.title, client: model.client.name, date: model.generatedOn, footerText, readiness: model.readiness });

  nodes.push({ kind: "heading", level: 1, text: "Executive summary" });
  if (summary && summary.paragraphs.length) nodes.push({ kind: "summary", paragraphs: summary.paragraphs, highlights: summary.highlights });
  else nodes.push({ kind: "paragraph", text: "An executive summary was not generated for this export.", muted: true });

  nodes.push({ kind: "heading", level: 1, text: "Response overview" });
  nodes.push({ kind: "overview", rows: overviewRows(model) });

  for (const section of model.sections) {
    nodes.push({ kind: "heading", level: 1, text: section.title });
    for (const q of section.questions) {
      const a = q.answer;
      const metaParts = [a?.compliance ? COMPLIANCE_LABEL[a.compliance] : null, a ? RESPONSE_STATUS_LABEL[a.status] : NOT_DRAFTED_LABEL, OWNER_LABEL[q.owner]].filter((p): p is string => !!p);
      nodes.push({
        kind: "question",
        refNo: q.refNo,
        question: q.questionText,
        meta: metaParts.join(" · "),
        compliance: a?.compliance ?? null,
        status: a?.status ?? null,
        blocks: a ? answerBlocks(a.text) : [],
        sources: a ? formatSources(a.sources) : null,
        openPoints: a?.openPoints ?? [],
        flagReason: a?.flagReason ?? null,
      });
    }
  }

  if (model.chro.length) {
    nodes.push({ kind: "heading", level: 1, text: CHRO_APPENDIX_TITLE, pageBreakBefore: true });
    const themes = [...new Set(model.chro.map((c) => c.theme))];
    for (const theme of themes) {
      nodes.push({
        kind: "chro",
        theme,
        questions: model.chro.filter((c) => c.theme === theme).map((c) => ({ text: c.questionText, rationale: c.rationale })),
      });
    }
  }
  return nodes;
}

export function chroThemeLabel(theme: ChroTheme): string {
  return CHRO_THEME_LABEL[theme];
}

// ---- Brand colours as office files want them ----

export interface ExportBrand {
  name: string;
  primaryColor: string;
  accentColor: string;
  successColor: string;
  fontFamily: string;
  footerText: string | null;
  logoUrl: string | null;
}

/** "#005184" → "005184"; anything unparseable → the fallback (already bare). */
export function brandHex(hex: string | null | undefined, fallback: string): string {
  const n = normaliseHex(hex);
  return (n ? n.slice(1) : fallback).toUpperCase();
}

export function argb(hex: string | null | undefined, fallback: string): string {
  return `FF${brandHex(hex, fallback)}`;
}

export function deepBrandHex(hex: string | null | undefined, fallback: string): string {
  const n = normaliseHex(hex);
  return brandHex(n ? deepenHex(n) : null, fallback);
}

export type Ink = "primary" | "accent" | "success" | "amber" | "red" | "muted";

export const COMPLIANCE_INK: Record<Compliance, Ink> = {
  fully: "success",
  partial: "amber",
  via_customization: "primary",
  via_partner: "primary",
  not_supported: "red",
  na: "muted",
};

export const STATUS_INK: Record<ResponseStatus, Ink> = {
  approved: "success",
  ai_draft: "accent",
  edited: "primary",
  flagged: "amber",
};

/** Fixed meaning colours (the brand supplies primary/accent/success). */
export const INK_HEX = { amber: "B45309", red: "B3261E", muted: "6B7280" } as const;

export function docxFont(fontFamily: string | null | undefined): string {
  return !fontFamily || fontFamily === "system" ? "Calibri" : fontFamily;
}
