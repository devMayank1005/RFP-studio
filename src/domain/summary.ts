import { z } from "zod";

import { COMPLIANCE_LABEL, COMPLIANCE_LEVELS, type Compliance } from "./enums";
import type { ExecutiveSummary } from "./export";

/**
 * The executive summary that opens a Word export: one Sonnet call over the
 * approved answers, the client brief and the compliance picture. Pure: what
 * the model is shown, the shape it must return, and how that is tidied. The
 * call itself is in src/engine/summary.ts.
 */

export interface SummaryInput {
  clientName: string;
  clientProfile: Record<string, unknown>;
  rfpTitle: string;
  engagementType: string;
  contextSummary: string | null;
  sectionTitles: string[];
  approved: Array<{ refNo: string; questionText: string; answerText: string; compliance: Compliance | null }>;
  counts: { total: number; approved: number } & Record<Compliance, number>;
}

export const SUMMARY_CAPS = { answerChars: 500, approvedChars: 30_000, briefChars: 6_000 } as const;

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

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

export function buildSummaryUserMessage(input: SummaryInput): string {
  const compliance = COMPLIANCE_LEVELS.filter((c) => input.counts[c] > 0)
    .map((c) => `${COMPLIANCE_LABEL[c]} ${input.counts[c]}`)
    .join(", ");
  const approvedLines = input.approved.map((r) => `- [${r.refNo}] ${clip(r.questionText, 300)} → ${clip(r.answerText, SUMMARY_CAPS.answerChars)}${r.compliance ? ` (${COMPLIANCE_LABEL[r.compliance]})` : ""}`);
  return [
    `CLIENT: ${input.clientName}`,
    `CLIENT PROFILE (from our CRM): ${JSON.stringify(input.clientProfile)}`,
    `RFP: ${input.rfpTitle} (${input.engagementType})`,
    `SECTIONS: ${input.sectionTitles.join("; ") || "(none)"}`,
    `COVERAGE: ${input.counts.total} questions, ${input.counts.approved} approved. Compliance: ${compliance || "not assessed"}.`,
    "",
    input.contextSummary?.trim() ? `CONTEXT BRIEF:\n${clip(input.contextSummary, SUMMARY_CAPS.briefChars)}` : "CONTEXT BRIEF: (none)",
    "",
    approvedLines.length ? `APPROVED ANSWERS (${approvedLines.length}):\n${capped(approvedLines, SUMMARY_CAPS.approvedChars)}` : "APPROVED ANSWERS (0): (none)",
    "",
    "Write the executive summary.",
  ].join("\n");
}

export const summaryOutputSchema = z.object({
  paragraphs: z.array(z.string()).describe("Three to five paragraphs of 60 to 110 words each"),
  highlights: z.array(z.string()).describe("Three to six single-sentence reasons to choose this response"),
});
export type SummaryOutput = z.infer<typeof summaryOutputSchema>;

const MAX_PARAGRAPHS = 5;
const MAX_HIGHLIGHTS = 6;

function tidy(list: string[], max: number): string[] {
  return list
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0)
    .slice(0, max);
}

export function sanitiseSummary(out: SummaryOutput): ExecutiveSummary {
  const paragraphs = tidy(out.paragraphs, MAX_PARAGRAPHS);
  if (!paragraphs.length) throw new Error("model returned no usable paragraphs for the executive summary");
  return { paragraphs, highlights: tidy(out.highlights, MAX_HIGHLIGHTS) };
}

/** Plain text of a summary, for storage and preview. */
export function flattenSummary(s: ExecutiveSummary): string {
  const body = s.paragraphs.join("\n\n");
  return s.highlights.length ? `${body}\n\n${s.highlights.map((h) => `• ${h}`).join("\n")}` : body;
}
