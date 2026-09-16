import { z } from "zod";

import { MODULES, type Module } from "./enums";
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
