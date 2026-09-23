import { z } from "zod";

import { CHRO_THEMES, type ChroStatus, type ChroTheme, type Compliance, type ResponseStatus } from "./enums";

/**
 * CHRO discovery questions: once most of an RFP is approved, Opus proposes
 * the questions a first conversation with the client's CHRO should open
 * with, grouped by six themes. Pure pieces only — no I/O.
 */

export const CHRO_THEME_HINT: Record<ChroTheme, string> = {
  mandate_vision: "Why now, what success looks like, whose mandate this is",
  scope_structure: "Entities, geographies, headcount, what is in and out",
  operating_model: "HR operating model, shared services, roles after go-live",
  tech_ai: "Current systems, integrations, data, appetite for AI",
  prioritization: "What must land first, trade-offs, phasing",
  governance_culture: "Sponsorship, decision rights, change readiness, unions",
};

export { STALE_QUEUE_MS, isStaleQueuedJob } from "./jobs";

/** How close an RFP is to the CHRO step: the approved share as a whole percentage, and `ready` once at least 80% is approved. */
export function chroReadiness(input: { approved: number; total: number }): { approved: number; total: number; pct: number; ready: boolean } {
  const { approved, total } = input;
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
  return { approved, total, pct, ready: total > 0 && approved / total >= 0.8 };
}

export interface ChroSourceRow {
  refNo: string;
  questionText: string;
  status: ResponseStatus | null;
  compliance: Compliance | null;
  answerText: string | null;
  openPoints: string[];
}

const GAP_COMPLIANCE = new Set<Compliance>(["partial", "not_supported"]);

/** Approved answers are what we can say; gaps are what the CHRO must help resolve. A row can be both. */
export function selectChroSources(rows: readonly ChroSourceRow[]): { approved: ChroSourceRow[]; gaps: ChroSourceRow[] } {
  return {
    approved: rows.filter((r) => r.status === "approved"),
    gaps: rows.filter((r) => (r.compliance !== null && GAP_COMPLIANCE.has(r.compliance)) || r.openPoints.length > 0),
  };
}

export interface ChroInput {
  clientName: string;
  clientProfile: Record<string, unknown>;
  rfpTitle: string;
  engagementType: string;
  contextSummary: string | null;
  approved: ChroSourceRow[];
  gaps: ChroSourceRow[];
  keptQuestions: Array<{ theme: ChroTheme; questionText: string }>;
}

export const CHRO_CAPS = { answerChars: 700, approvedChars: 36_000, gapChars: 20_000, briefChars: 6_000 } as const;

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/** Lines until the budget runs out, then "(and n more)" so the model knows the list was cut. */
function capped(lines: string[], budget: number): string {
  const out: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > budget) {
      out.push(`(and ${lines.length - out.length} more)`);
      break;
    }
    out.push(line);
    used += line.length + 1;
  }
  return out.join("\n");
}

/** The user turn for the CHRO call: client and brief, the approved answers and gaps within their budgets, and the questions already kept so the model does not repeat them. */
export function buildChroUserMessage(input: ChroInput): string {
  const approvedLines = input.approved.map((r) => `- [${r.refNo}] ${clip(r.questionText, 300)} → ${clip(r.answerText ?? "", CHRO_CAPS.answerChars)}`);
  const gapLines = input.gaps.map((r) => {
    const bits = [`- [${r.refNo}] ${clip(r.questionText, 300)}`];
    if (r.compliance) bits.push(r.compliance);
    if (r.openPoints.length) bits.push(`open: ${r.openPoints.map((p) => clip(p, 200)).join("; ")}`);
    return bits.join(" · ");
  });
  const kept = input.keptQuestions.map((k) => `- [${k.theme}] ${clip(k.questionText, 300)}`);
  return [
    `CLIENT: ${input.clientName}`,
    `CLIENT PROFILE (from our CRM): ${JSON.stringify(input.clientProfile)}`,
    `RFP: ${input.rfpTitle} (${input.engagementType})`,
    "",
    input.contextSummary?.trim() ? `CONTEXT BRIEF:\n${clip(input.contextSummary, CHRO_CAPS.briefChars)}` : "CONTEXT BRIEF: (none)",
    "",
    approvedLines.length ? `APPROVED ANSWERS (${approvedLines.length}):\n${capped(approvedLines, CHRO_CAPS.approvedChars)}` : "APPROVED ANSWERS (0): (none)",
    "",
    gapLines.length ? `GAPS AND OPEN POINTS (${gapLines.length}):\n${capped(gapLines, CHRO_CAPS.gapChars)}` : "GAPS AND OPEN POINTS (0): (none)",
    "",
    kept.length ? `ALREADY KEPT (do not repeat):\n${kept.join("\n")}` : "ALREADY KEPT (do not repeat): (none)",
    "",
    "Write 12–16 questions.",
  ].join("\n");
}

export const chroOutputSchema = z.object({
  questions: z.array(
    z.object({
      theme: z.enum(CHRO_THEMES),
      question_text: z.string().describe("One open question, addressed to the CHRO"),
      rationale: z.string().describe("Why this matters for this client, citing the RFP ref it comes from"),
    }),
  ),
});
export type ChroOutput = z.infer<typeof chroOutputSchema>;

export interface ChroSuggestion {
  theme: ChroTheme;
  questionText: string;
  rationale: string;
}

const MIN_QUESTIONS = 8;
const MAX_QUESTIONS = 16;

/** Trim, drop blanks and repeats, cap at 16; too few means the model did not do the job. */
export function sanitiseChroOutput(out: ChroOutput): ChroSuggestion[] {
  const seen = new Set<string>();
  const cleaned: ChroSuggestion[] = [];
  for (const q of out.questions) {
    const questionText = q.question_text.replace(/\s+/g, " ").trim();
    const key = questionText.toLowerCase();
    if (!questionText || seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ theme: q.theme, questionText, rationale: q.rationale.replace(/\s+/g, " ").trim() });
    if (cleaned.length === MAX_QUESTIONS) break;
  }
  if (cleaned.length < MIN_QUESTIONS) throw new Error(`model returned ${cleaned.length} usable questions, expected 12–16`);
  return cleaned;
}

/** A theme's position in the canonical order; sort orders and grouping are built on it. */
export function themeIndex(theme: ChroTheme): number {
  return CHRO_THEMES.indexOf(theme);
}

/** Positions are `themeIndex * 100 + n`, so a theme owns a block and reordering never crosses themes. */
const THEME_BLOCK = 100;

export interface ChroRowLike {
  id: string;
  theme: ChroTheme;
  sortOrder: number;
  createdAt: Date | string;
}

/** Display order: theme first, then sort order, then creation time as a stable tie-break. */
export function sortChroRows<T extends ChroRowLike>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => themeIndex(a.theme) - themeIndex(b.theme) || a.sortOrder - b.sortOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** Rows bucketed under every theme in canonical order; an empty theme still appears so its heading can show. */
export function groupByTheme<T extends { theme: ChroTheme }>(rows: readonly T[]): Array<{ theme: ChroTheme; rows: T[] }> {
  return CHRO_THEMES.map((theme) => ({ theme, rows: rows.filter((r) => r.theme === theme) }));
}

/** Rows per status; every status is present (zero when none) so the UI never reads undefined. */
export function chroCounts(rows: ReadonlyArray<{ status: ChroStatus }>): Record<ChroStatus, number> {
  const counts: Record<ChroStatus, number> = { suggested: 0, kept: 0, dropped: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
}

/** Sort orders for new rows: each theme continues after the rows it already has. */
export function assignSortOrders(existing: ReadonlyArray<{ theme: ChroTheme; sortOrder: number }>, fresh: ReadonlyArray<{ theme: ChroTheme }>): number[] {
  const next = new Map<ChroTheme, number>();
  for (const theme of CHRO_THEMES) {
    const positions = existing.filter((r) => r.theme === theme).map((r) => r.sortOrder - themeIndex(theme) * THEME_BLOCK);
    next.set(theme, positions.length ? Math.max(...positions) + 1 : 0);
  }
  return fresh.map((f) => {
    const pos = next.get(f.theme)!;
    next.set(f.theme, pos + 1);
    return themeIndex(f.theme) * THEME_BLOCK + pos;
  });
}

/** Swap a row with its neighbour inside its theme. Null when already at that edge. */
export function swapNeighbour<T extends ChroRowLike>(themeRows: readonly T[], id: string, direction: "up" | "down"): [{ id: string; sortOrder: number }, { id: string; sortOrder: number }] | null {
  const sorted = sortChroRows(themeRows);
  const i = sorted.findIndex((r) => r.id === id);
  if (i === -1) return null;
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= sorted.length) return null;
  const base = themeIndex(sorted[i].theme) * THEME_BLOCK;
  return [
    { id: sorted[i].id, sortOrder: base + j },
    { id: sorted[j].id, sortOrder: base + i },
  ];
}
