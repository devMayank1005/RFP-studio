import { z } from "zod";

import { MODULES, OWNERS, QUESTION_TYPES, type Compliance, type Module, type Owner, type QuestionType } from "./enums";

/**
 * Pure rules for turning a parsed RFP into questions: which column is what,
 * what the client's priority and a vendor's earlier answers mean, how rows
 * are chunked for the model, and the schemas the model is constrained to.
 * No I/O here — the engine calls Claude, this decides what to ask and what
 * to do with the answer.
 */

// ---- Column roles ----

export const COLUMN_ROLES = [
  "question",
  "acceptance_criteria",
  "priority",
  "section",
  "ref_no",
  "existing_compliance",
  "existing_answer",
  "existing_questions",
  "remarks",
  "other",
] as const;
export type ColumnRole = (typeof COLUMN_ROLES)[number];
export type GuessedRole = ColumnRole | "unknown";

function norm(header: string): string {
  return header.toLowerCase().replace(/[_\-–—/]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Deterministic first pass over headers. Anything it cannot place is
 * `unknown`, which is the signal to ask the model. Exactly one column may be
 * the question; later question-like headers become acceptance criteria if
 * they read that way, `existing_questions` if they are plural queries, else
 * `other`.
 */
export function guessColumnRoles(headers: string[]): Record<string, GuessedRole> {
  const roles: Record<string, GuessedRole> = {};
  let hasQuestion = false;

  for (const header of headers) {
    const h = norm(header);
    let role: GuessedRole = "unknown";

    if (/acceptance|expected outcome|success criteria|minimum expected/.test(h)) role = "acceptance_criteria";
    else if (/^(s\.? ?no\.?|sr\.? ?no\.?|sl\.? ?no\.?|serial( no\.?)?|#|id|no\.?|ref(erence)?( no\.?| id)?|req(uirement)? ?(id|no\.?|#)|item ?no\.?|seq(uence)?( no\.?)?)$/.test(h)) role = "ref_no";
    else if (/priority|mandatory|criticality|importance|must have|weightage|weight/.test(h)) role = "priority";
    else if (/\(y|y\/n|yes\/no|y\/p\/n|feasib|complian|availab|supported|fit ?gap|response code|response type/.test(h)) role = "existing_compliance";
    else if (/^(module|section|area|category|domain|function(al)? area|process( area)?|theme|sub ?module|topic|workstream|tower)s?$/.test(h)) role = "section";
    else if (/remark|comment|note/.test(h)) role = "remarks";
    else if (/clarification|queries|questions? (to|for) (the )?client|^questions$/.test(h)) role = hasQuestion ? "existing_questions" : "question";
    else if (/^(solution|answer|response|vendor (response|comments?)|proposed solution|our (response|answer)|approach|bidder response|how (we|it))( description)?$/.test(h)) role = "existing_answer";
    else if (/requirement|question|query|specification|functionality|feature|capability|description|scope item|ask/.test(h)) role = hasQuestion ? "other" : "question";

    if (role === "question") hasQuestion = true;
    roles[header] = role;
  }
  return roles;
}

export interface ColumnMap {
  question: string | null;
  acceptanceCriteria: string | null;
  priority: string | null;
  section: string | null;
  refNo: string | null;
  existingCompliance: string | null;
  existingAnswer: string | null;
  existingQuestions: string | null;
  /** Columns kept verbatim in raw_meta without interpretation. */
  passthrough: string[];
  hasQuestion: boolean;
}

export function columnMapFromRoles(roles: Record<string, GuessedRole>): ColumnMap {
  const first = (role: ColumnRole) => Object.entries(roles).find(([, r]) => r === role)?.[0] ?? null;
  const passthrough = Object.entries(roles)
    .filter(([, r]) => r === "other" || r === "remarks" || r === "unknown")
    .map(([h]) => h);
  const question = first("question");
  return {
    question,
    acceptanceCriteria: first("acceptance_criteria"),
    priority: first("priority"),
    section: first("section"),
    refNo: first("ref_no"),
    existingCompliance: first("existing_compliance"),
    existingAnswer: first("existing_answer"),
    existingQuestions: first("existing_questions"),
    passthrough,
    hasQuestion: question !== null,
  };
}

// ---- Value mapping ----

/** Must-have wording → mandatory. Anything else (should, could, nice, dependency, blank) is not. */
export function mapPriority(value: string | null | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return false;
  if (/^(m|h|p1|1|must|must[- ]have|mandatory|high|critical|essential|required|core)$/.test(v)) return true;
  return /^must\b|mandatory|critical|essential/.test(v);
}

/** A vendor's earlier yes / partial / no → our compliance vocabulary. Undecided → null. */
export function mapExistingCompliance(value: string | null | undefined): Compliance | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v || /^(tbd|tbc|to be (decided|confirmed)|pending|\?+|-+)$/.test(v)) return null;
  if (/^(na|n\/a|not applicable)$/.test(v)) return "na";
  if (/partial|partly|^p$/.test(v)) return "partial";
  if (/custom|config/.test(v)) return "via_customization";
  if (/partner|third[- ]party|3rd/.test(v)) return "via_partner";
  if (/^(no|n)$|not supported|not available|unsupported|cannot/.test(v)) return "not_supported";
  if (/^(yes|y)$|fully|available|standard|supported|complian|complies|out of the box|ootb/.test(v)) return "fully";
  return null;
}

// ---- Structure ----

export function generateRefNo(index: number, existing?: string | null): string {
  const own = (existing ?? "").trim();
  if (own) return own;
  return `R-${String(index + 1).padStart(3, "0")}`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function chunkPages<T extends { text: string }>(pages: T[], maxChars: number): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let chars = 0;
  for (const page of pages) {
    if (current.length && chars + page.text.length > maxChars) {
      out.push(current);
      current = [];
      chars = 0;
    }
    current.push(page);
    chars += page.text.length;
  }
  if (current.length) out.push(current);
  return out;
}

export function normaliseSectionTitle(title: string | null | undefined): string {
  const t = (title ?? "").replace(/\s+/g, " ").trim().replace(/[\s:;,.\-–—]+$/g, "").trim();
  return t || "General";
}

// ---- What the model returns (structured outputs) ----

export const columnClassificationSchema = z.object({
  columns: z.array(z.object({ header: z.string(), role: z.enum(COLUMN_ROLES) })),
});
export type ColumnClassification = z.infer<typeof columnClassificationSchema>;

export const sheetExtractionSchema = z.object({
  rows: z.array(
    z.object({
      source_row: z.number().int(),
      is_question: z.boolean(),
      section_title: z.string(),
      question_type: z.enum(QUESTION_TYPES),
      module_hint: z.enum(MODULES),
      owner_guess: z.enum(OWNERS),
    }),
  ),
});
export type SheetExtraction = z.infer<typeof sheetExtractionSchema>;

export const narrativeExtractionSchema = z.object({
  questions: z.array(
    z.object({
      source_page: z.number().int(),
      section_title: z.string(),
      ref_no: z.string().nullable(),
      question_text: z.string(),
      question_type: z.enum(QUESTION_TYPES),
      is_mandatory: z.boolean(),
      module_hint: z.enum(MODULES),
      owner_guess: z.enum(OWNERS),
    }),
  ),
});
export type NarrativeExtraction = z.infer<typeof narrativeExtractionSchema>;

export const briefSchema = z.object({
  context_summary: z.string(),
  key_facts: z.array(z.string()),
});
export type Brief = z.infer<typeof briefSchema>;

// ---- What the pipeline produces ----

export interface ExtractedQuestion {
  sourceRow: number | null;
  sourcePage: number | null;
  refNo: string;
  sectionTitle: string;
  questionText: string;
  acceptanceCriteria: string | null;
  questionType: QuestionType;
  isMandatory: boolean;
  owner: Owner;
  moduleHint: Module;
  /** The client's row, verbatim, keyed by their headers. */
  rawMeta: Record<string, string>;
  /** A vendor's earlier answer found in the sheet, if the columns carried one. */
  existing: { compliance: Compliance | null; answer: string | null; questions: string | null } | null;
}
