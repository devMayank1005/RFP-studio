import { z } from "zod";

import { stripCitationMarkers } from "./drafting";
import { AVAILABILITIES, MODULES, type Availability, type Module } from "./enums";
import { sheetCandidates, type ColumnMap } from "./extraction";
import { tidyTags } from "./tags";

/**
 * `pnpm kb:ingest <file>`: a Darwinbox document becomes knowledge-base
 * entries. The model reads; these pure pieces keep the result honest. No I/O.
 */

export const ingestOutputSchema = z.object({
  entries: z.array(
    z.object({
      feature_name: z.string().describe("Short, specific capability name as a reviewer would search for it"),
      module: z.enum(MODULES),
      body: z.string().describe("What is possible, how it is configured, and the boundary — 2–6 sentences a bid answer can cite"),
      availability: z.enum(AVAILABILITIES),
      tags: z.array(z.string()),
    }),
  ),
});
export type IngestOutput = z.infer<typeof ingestOutputSchema>;
export type RawIngestEntry = IngestOutput["entries"][number];

export interface IngestEntry {
  featureName: string;
  module: Module;
  body: string;
  availability: Availability;
  tags: string[];
}

/** Anything shorter is a heading or a pointer, not a passage an answer can cite. */
export const MIN_BODY_CHARS = 40;

function featureKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Trim, drop the uncitable, and keep one entry per feature — the fuller body wins, tags merge. */
export function normaliseIngestEntries(raw: readonly RawIngestEntry[]): IngestEntry[] {
  const byKey = new Map<string, IngestEntry>();
  for (const r of raw) {
    const featureName = r.feature_name.replace(/\s+/g, " ").trim();
    const body = r.body.trim();
    if (!featureName || body.length < MIN_BODY_CHARS) continue;
    const key = featureKey(featureName);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { featureName, module: r.module, body, availability: r.availability, tags: tidyTags(r.tags) });
      continue;
    }
    const tags = tidyTags([...existing.tags, ...r.tags]);
    byKey.set(key, body.length > existing.body.length ? { ...existing, body, module: r.module, availability: r.availability, tags } : { ...existing, tags });
  }
  return [...byKey.values()];
}

function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Stable key for an entry: re-ingesting the same file updates in place instead of duplicating. */
export function ingestEntrySlug(sourceName: string, featureName: string): string {
  const base = sourceName.replace(/\.[^.]+$/, "");
  return `${kebab(base)}:${kebab(featureName)}`;
}

export function buildIngestUserMessage(input: { sourceName: string; pages: ReadonlyArray<{ page: number; text: string }>; known: readonly string[] }): string {
  return [
    `DOCUMENT: ${input.sourceName}`,
    `ALREADY CAPTURED (do not repeat): ${input.known.length ? input.known.join("; ") : "(none yet)"}`,
    "",
    ...input.pages.map((p) => `--- page ${p.page} ---\n${p.text}`),
  ].join("\n\n");
}


// ---- Precedents: a past RFP response becomes reusable question/answer pairs ----

export const precedentOutputSchema = z.object({
  precedents: z.array(
    z.object({
      question: z.string().describe("The client's requirement or question, one line, as it was asked"),
      answer: z.string().describe("The answer as given, 1–3 sentences, no client names, no citation markers"),
      module: z.enum(MODULES),
      tags: z.array(z.string()),
    }),
  ),
});
export type PrecedentOutput = z.infer<typeof precedentOutputSchema>;
export type RawPrecedent = PrecedentOutput["precedents"][number];

export interface Precedent {
  question: string;
  answer: string;
  module: Module;
  tags: string[];
}

/** Shorter than this is a "Yes" or a heading — nothing a future draft can reuse. */
export const MIN_PRECEDENT_ANSWER_CHARS = 40;
const MIN_PRECEDENT_QUESTION_CHARS = 10;

function questionKey(question: string): string {
  return question
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[?.!\s]+$/, "");
}

/** Trim, strip markers, drop the unreusable, keep one precedent per question — the fuller answer wins, tags merge. */
export function normalisePrecedents(raw: readonly RawPrecedent[]): Precedent[] {
  const byKey = new Map<string, Precedent>();
  for (const r of raw) {
    const question = r.question.replace(/\s+/g, " ").trim();
    const answer = stripCitationMarkers(r.answer);
    if (question.length < MIN_PRECEDENT_QUESTION_CHARS || answer.length < MIN_PRECEDENT_ANSWER_CHARS) continue;
    const key = questionKey(question);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { question, answer, module: r.module, tags: tidyTags(r.tags) });
      continue;
    }
    const tags = tidyTags([...existing.tags, ...r.tags]);
    byKey.set(key, answer.length > existing.answer.length ? { ...existing, answer, module: r.module, tags } : { ...existing, tags });
  }
  return [...byKey.values()];
}

/** Stable key for a precedent: re-ingesting the same response updates in place instead of duplicating. */
export function precedentSlug(sourceName: string, question: string): string {
  const base = sourceName.replace(/\.[^.]+$/, "");
  return `${kebab(base)}:${kebab(questionKey(question)).slice(0, 120)}`;
}

/**
 * A filled requirements sheet (the client's questions with our answers in
 * their columns) needs no model: every row with a question and an answer is
 * a precedent as it stands. Module stays "general" — retrieval is by meaning.
 */
export function sheetPrecedents(sheet: { name: string; headers: string[]; rows: Array<{ row: number; cells: Record<string, string> }> }, map: ColumnMap): Precedent[] {
  if (!map.question || !map.existingAnswer) return [];
  const answerCol = map.existingAnswer;
  const raw: RawPrecedent[] = sheetCandidates(sheet, map.question).map((r) => ({
    question: r.cells[map.question!] ?? "",
    answer: r.cells[answerCol] ?? "",
    module: "general" as const,
    tags: [],
  }));
  return normalisePrecedents(raw);
}

export function buildPrecedentUserMessage(input: { sourceName: string; pages: ReadonlyArray<{ page: number; text: string }>; known: readonly string[] }): string {
  return [
    `DOCUMENT: ${input.sourceName}`,
    `ALREADY CAPTURED (do not repeat): ${input.known.length ? input.known.join("; ") : "(none yet)"}`,
    "",
    ...input.pages.map((p) => `--- page ${p.page} ---\n${p.text}`),
  ].join("\n\n");
}
