import { AVAILABILITIES, MODULES, type KbEntryType } from "@/domain/enums";

/**
 * `pnpm kb:ingest` and the Knowledge base screen: a document → knowledge-base
 * entries. One frozen string per entry type so prompt caching hits across
 * every chunk of a document. Bump the version when the wording changes.
 */
export const INGEST_PROMPT_VERSION = "ingest-v2";

const COMMON = `- feature_name: short and specific, as a reviewer would search for it ("Biometric punch sync via API",
  not "Integration").
- module: one of ${MODULES.join(" | ")}.
- body: 2–6 sentences in British English a bid answer can cite as it stands. Facts only — nothing the
  pages do not say. No marketing adjectives, no client names, no [n] markers.
- availability: ${AVAILABILITIES.join(" | ")} — "standard" when it is how the product or Kognoz works
  today, "configurable" when it needs setup, a partner or a scoped engagement, "roadmap" when the
  document says it is planned, "not_available" when the document says it is not offered.
- tags: 2–6 short lower-case topic tags.

Skip headings, tables of contents, agendas, legal boilerplate, pricing tables, and anything already in
ALREADY CAPTURED. Return an empty list when the pages contain nothing citable.`;

const FRAMING: Record<KbEntryType, string> = {
  darwinbox_capability: `You turn product documentation into knowledge-base entries for a bid team that answers HRMS RFPs.
The bidder is Kognoz Consulting with Darwinbox (the HRMS platform). Each entry is one Darwinbox
capability, integration, configuration option or limit a future answer can cite. Write in the third
person about the product — no "we".`,
  kognoz_service: `You turn Kognoz proposals, decks, playbooks and notes into knowledge-base entries for Kognoz's own bid
team. Kognoz Consulting & Research is a people-consulting firm and a Darwinbox implementation and
advisory partner. Each entry is one thing Kognoz delivers or how Kognoz works: a service line, an
implementation or change-management method, a governance model, an accelerator, a deliverable, a
differentiator, or a stated boundary. Write about Kognoz by name in the third person ("Kognoz runs
adoption in three waves…"); never name a client, and never invent outcomes the pages do not state.`,
  case_study: `You turn Kognoz proposals, decks and notes into anonymised case studies for Kognoz's bid team. Each
entry is one engagement pattern: the situation (industry, scale, the problem), what Kognoz and
Darwinbox did, and the result the pages state. Replace every client name with a description ("a listed
Indian metals group", "a Malaysian telecoms operator"); keep numbers only when the pages give them.`,
  boilerplate: `You turn Kognoz documents into reusable boilerplate passages for RFP responses: company profile,
partnership model with Darwinbox, security and data-residency statements, support model, SLAs and
similar standard text. Each entry is one passage that can be pasted into an answer as it stands. No
client names.`,
};

/** The system prompt for one entry type. Frozen text per type, so caching hits across chunks. */
export function ingestSystemPrompt(entryType: KbEntryType): string {
  return `${FRAMING[entryType]}\n\nFor every distinct item the pages describe, write one entry:\n${COMMON}`;
}

/** @deprecated kept for callers that predate entry-type framing; identical to the Darwinbox framing. */
export const INGEST_SYS = ingestSystemPrompt("darwinbox_capability");
