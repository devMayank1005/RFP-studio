import { z } from "zod";

import { AVAILABILITIES, KB_ENTRY_TYPES, MODULES, type KbEntryType, type Module } from "./enums";
import { MIN_BODY_CHARS } from "./ingest";
import { tidyTags } from "./tags";

/**
 * Promoting an approved answer into the knowledge base ("Add to KB"). The
 * model rewrites the question/answer pair so it stands on its own for the
 * next RFP; these are the pure parts around that call. No I/O.
 */

export const generaliseOutputSchema = z.object({
  canonical_question: z.string().describe("The question with the client's specifics removed, as a future RFP might ask it"),
  canonical_answer: z.string().describe("The approved answer, rewritten to hold for any client"),
  module: z.enum(MODULES),
  tags: z.array(z.string()).describe("2–6 short lower-case topic tags"),
});
export type GeneraliseOutput = z.infer<typeof generaliseOutputSchema>;

export interface GeneraliseInput {
  clientName: string;
  questionText: string;
  acceptanceCriteria: string | null;
  answerText: string;
  moduleHint: Module;
}

export function buildGeneraliseUserMessage(input: GeneraliseInput): string {
  return [
    `CLIENT: ${input.clientName}`,
    `MODULE HINT: ${input.moduleHint}`,
    "",
    `QUESTION: ${input.questionText}`,
    input.acceptanceCriteria ? `Expected: ${input.acceptanceCriteria}` : null,
    "",
    `APPROVED ANSWER:\n${input.answerText}`,
    "",
    "Rewrite the pair so it stands on its own.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** Tokens of a client name that are too generic to scrub on their own. */
const GENERIC_NAME_WORDS = new Set([
  "limited", "ltd", "pvt", "private", "inc", "llc", "llp", "plc", "group", "corp", "corporation",
  "company", "co", "the", "and", "of", "demo", "india", "global", "international", "holdings", "services",
]);
/** Shorter names ("Go", "One") collide with ordinary words; leave them for the reviewer. */
const MIN_NAME_CHARS = 4;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The full name plus each distinctive word of it, longest first so "Vedanta Limited" goes before "Vedanta". */
function clientNameVariants(clientName: string): string[] {
  const full = clientName.replace(/\s+/g, " ").trim();
  const variants = new Set<string>();
  if (full.length >= MIN_NAME_CHARS) variants.add(full);
  for (const token of full.split(" ")) {
    const word = token.replace(/[^\p{L}\p{N}]/gu, "");
    if (word.length >= MIN_NAME_CHARS && !GENERIC_NAME_WORDS.has(word.toLowerCase())) variants.add(word);
  }
  return [...variants].sort((a, b) => b.length - a.length);
}

/**
 * Replace the client's name (any case, possessive included) with "the client".
 * The prompt asks the model to do this; this is the guarantee behind it, since
 * one leaked name in a shared corpus surfaces in every later bid.
 */
export function scrubClientName(text: string, clientName: string): string {
  let out = text;
  for (const variant of clientNameVariants(clientName)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(variant)}(['’]s)?(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, (_match: string, possessive: string | undefined, offset: number, whole: string) => {
      const before = whole.slice(0, offset).trimEnd();
      const sentenceStart = before === "" || /[.!?]$/.test(before);
      const phrase = possessive ? "the client's" : "the client";
      return sentenceStart ? phrase[0].toUpperCase() + phrase.slice(1) : phrase;
    });
  }
  return out;
}

/** "[n]" markers refer to passages the next RFP will not have. */
function stripCitationMarkers(text: string): string {
  return text.replace(/\s*\[\d+\]/g, "");
}

export function sanitiseGeneralised(out: GeneraliseOutput, clientName: string): GeneraliseOutput {
  const clean = (s: string) => scrubClientName(stripCitationMarkers(s), clientName).replace(/[ \t]{2,}/g, " ").trim();
  return {
    canonical_question: clean(out.canonical_question),
    canonical_answer: clean(out.canonical_answer),
    module: out.module,
    tags: tidyTags(out.tags),
  };
}

// ---- Knowledge base screen ----

export const KB_TABS = ["capabilities", "services", "answers", "sources"] as const;
export type KbTab = (typeof KB_TABS)[number];
export const KB_TAB_LABEL: Record<KbTab, string> = {
  capabilities: "Darwinbox capabilities",
  services: "Kognoz services",
  answers: "Approved answers",
  sources: "Sources",
};

/** Tabs that list kb_entries. Retrieval already pools everything Kognoz-authored for `owner = kognoz`, so the screen does too. */
export type KbEntryTab = Extract<KbTab, "capabilities" | "services">;

export function entryTypesForTab(tab: KbTab): KbEntryType[] {
  if (tab === "capabilities") return ["darwinbox_capability"];
  if (tab === "services") return ["kognoz_service", "case_study", "boilerplate"];
  return [];
}

export function tabForEntryType(type: KbEntryType): KbEntryTab {
  return type === "darwinbox_capability" ? "capabilities" : "services";
}

/** Free text from a tag field: commas or newlines separate, then the usual tidy. */
export function parseTagInput(raw: string): string[] {
  return tidyTags(raw.split(/[,\n]/));
}

const tagsField = z.union([z.string(), z.array(z.string())]).transform((v) => (typeof v === "string" ? parseTagInput(v) : tidyTags(v)));

export const kbEntryInputSchema = z.object({
  featureName: z.string().trim().min(3, "Give the capability a name.").max(160),
  product: z.string().trim().min(2, "Which product is this about?").max(60),
  entryType: z.enum(KB_ENTRY_TYPES),
  module: z.enum(MODULES),
  availability: z.enum(AVAILABILITIES),
  body: z.string().trim().min(MIN_BODY_CHARS, `Write at least ${MIN_BODY_CHARS} characters — this is the passage an answer will cite.`).max(6_000),
  tags: tagsField.default([]),
  isActive: z.boolean().default(true),
});
export type KbEntryInput = z.infer<typeof kbEntryInputSchema>;

export const approvedAnswerInputSchema = z.object({
  canonicalQuestion: z.string().trim().min(10, "Write the question a future RFP would ask.").max(1_000),
  canonicalAnswer: z.string().trim().min(20, "The answer needs at least a sentence.").max(8_000),
  module: z.enum(MODULES),
  tags: tagsField.default([]),
});
export type ApprovedAnswerInput = z.infer<typeof approvedAnswerInputSchema>;

export interface EmbedFields {
  product: string;
  module: Module;
  featureName: string;
  body: string;
  tags: readonly string[];
}

/** True when an edit changes the text `kbEntryEmbedText` is built from — the only case that needs a Voyage call. */
export function embedFieldsChanged(before: EmbedFields, after: EmbedFields): boolean {
  return (
    before.product !== after.product ||
    before.module !== after.module ||
    before.featureName !== after.featureName ||
    before.body !== after.body ||
    before.tags.join("\u0000") !== after.tags.join("\u0000")
  );
}

/** Rows grouped in the canonical module order; modules with nothing are left out. */
export function groupEntriesByModule<T extends { module: Module }>(rows: readonly T[]): Array<{ module: Module; rows: T[] }> {
  const byModule = new Map<Module, T[]>();
  for (const row of rows) (byModule.get(row.module) ?? byModule.set(row.module, []).get(row.module)!).push(row);
  return MODULES.filter((m) => byModule.has(m)).map((module) => ({ module, rows: byModule.get(module)! }));
}
