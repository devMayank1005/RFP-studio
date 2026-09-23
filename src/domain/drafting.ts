import { z } from "zod";

import { COMPLIANCE_LEVELS, type Module, type Owner, type QuestionType } from "./enums";

/**
 * Pure pieces of the drafting loop: how retrieved passages are numbered for
 * the model, how the user turn is assembled, and the schema the model is
 * constrained to. No I/O.
 */

export type PassageKind = "kb_entry" | "approved_answer";

export interface Passage {
  id: string;
  kind: PassageKind;
  /** One line the model sees as the passage's title, e.g. "Darwinbox · Payroll · Statutory". */
  label: string;
  text: string;
  similarity?: number;
}

export interface NumberedPassage extends Passage {
  n: number;
}

/** Knowledge-base entries first, then approved answers, one running count. */
export function numberPassages(entries: Passage[], answers: Passage[]): NumberedPassage[] {
  return [...entries, ...answers].map((p, i) => ({ ...p, n: i + 1 }));
}

export interface DraftQuestion {
  refNo: string;
  questionText: string;
  acceptanceCriteria: string | null;
  questionType: QuestionType;
  owner: Owner;
  moduleHint: Module;
  isMandatory: boolean;
}

export interface DraftRequest {
  question: DraftQuestion;
  passages: NumberedPassage[];
  instruction?: string | null;
  previousDraft?: string | null;
}

/** The user turn for one draft: the question and its metadata, the numbered passages (or a note that none were found), then any previous draft and reviewer instruction. */
export function buildDraftUserMessage(req: DraftRequest): string {
  const q = req.question;
  const lines = [
    `QUESTION ${q.refNo}: ${q.questionText}`,
    q.acceptanceCriteria ? `Expected: ${q.acceptanceCriteria}` : null,
    `TYPE: ${q.questionType} · OWNER: ${q.owner} · MODULE: ${q.moduleHint} · MANDATORY: ${q.isMandatory ? "yes" : "no"}`,
    "",
    req.passages.length ? `PASSAGES (${req.passages.length}):` : "PASSAGES: (no passages retrieved — mark the answer partial and list what must be confirmed)",
    ...req.passages.map((p) => `[${p.n}] ${p.label}\n${p.text}`),
  ];
  if (req.previousDraft) lines.push("", `PREVIOUS DRAFT:\n${req.previousDraft}`);
  if (req.instruction) lines.push("", `REVIEWER INSTRUCTION: ${req.instruction}`);
  lines.push("", "Write the answer.");
  return lines.filter((l): l is string => l !== null).join("\n");
}

export const draftOutputSchema = z.object({
  compliance: z.enum(COMPLIANCE_LEVELS),
  confidence: z.number().describe("0 to 1"),
  draft_text: z.string(),
  citations: z.array(z.object({ n: z.number().int(), why: z.string() })),
  open_points: z.array(z.string()),
});
export type DraftOutput = z.infer<typeof draftOutputSchema>;

/**
 * Every generated answer is at most this long. Client matrices want one
 * complete, concise line per requirement; anything longer is the reviewer's
 * job to add, not the model's to volunteer. Citations and open points are
 * separate fields, so they cost the answer nothing.
 */
export const ANSWER_MAX_CHARS = 200;

const CITATION_MARKER = /\s*\[(?:\d+|brief)\]/g;

/** Removes inline [n] / [brief] markers and the whitespace they leave; citations live in their own field. */
export function stripCitationMarkers(text: string): string {
  return text
    .replace(CITATION_MARKER, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/**
 * Last resort after the model has been asked to tighten: cut at the last
 * sentence end that fits, else at a word boundary. Never mid-word, and the
 * caller records `truncated` so a reviewer can see the answer was cut.
 */
export function fitAnswer(text: string, max = ANSWER_MAX_CHARS): { text: string; truncated: boolean } {
  const clean = text.trim();
  if (clean.length <= max) return { text: clean, truncated: false };
  const window = clean.slice(0, max + 1);
  let sentenceEnd = -1;
  for (const m of window.matchAll(/[.!?](?=\s|$)/g)) if (m.index + 1 <= max) sentenceEnd = m.index + 1;
  if (sentenceEnd > 0) return { text: clean.slice(0, sentenceEnd).trim(), truncated: true };
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const words = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:—-]+$/, "");
  // A word-boundary cut still reads as a sentence when it ends with a full stop.
  return { text: /[.!?]$/.test(words) || words.length >= max ? words : `${words}.`, truncated: true };
}

/**
 * Clamp what the model returned to what the store accepts: confidence in
 * [0,1], citations only for numbers it was given, no inline markers in the
 * text, and a flag when the text is still over ANSWER_MAX_CHARS.
 */
export function sanitiseDraft(draft: DraftOutput, given: NumberedPassage[]): DraftOutput & { overLimit: boolean } {
  const known = new Set(given.map((p) => p.n));
  const seen = new Set<number>();
  const draft_text = stripCitationMarkers(draft.draft_text);
  return {
    ...draft,
    confidence: Math.min(1, Math.max(0, Number.isFinite(draft.confidence) ? draft.confidence : 0)),
    draft_text,
    citations: draft.citations.filter((c) => known.has(c.n) && !seen.has(c.n) && seen.add(c.n)),
    open_points: draft.open_points.map((p) => p.trim()).filter(Boolean),
    overLimit: draft_text.length > ANSWER_MAX_CHARS,
  };
}
