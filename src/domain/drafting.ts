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

/** Clamp what the model returned to what the store accepts: confidence in [0,1], citations only for numbers it was given. */
export function sanitiseDraft(draft: DraftOutput, given: NumberedPassage[]): DraftOutput {
  const known = new Set(given.map((p) => p.n));
  const seen = new Set<number>();
  return {
    ...draft,
    confidence: Math.min(1, Math.max(0, Number.isFinite(draft.confidence) ? draft.confidence : 0)),
    draft_text: draft.draft_text.trim(),
    citations: draft.citations.filter((c) => known.has(c.n) && !seen.has(c.n) && seen.add(c.n)),
    open_points: draft.open_points.map((p) => p.trim()).filter(Boolean),
  };
}
