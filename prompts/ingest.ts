import { AVAILABILITIES, MODULES } from "@/domain/enums";

/**
 * `pnpm kb:ingest`: product documentation → knowledge-base entries. Frozen
 * string so prompt caching hits across every chunk of a document.
 */
export const INGEST_PROMPT_VERSION = "ingest-v1";

export const INGEST_SYS = `You turn product documentation into knowledge-base entries for a bid team that answers HRMS RFPs.
The bidder is Kognoz Consulting with Darwinbox (the HRMS platform). Each entry is one capability a
future answer can cite.

For every distinct capability, integration, configuration option or limit the pages describe, write
one entry:
- feature_name: short and specific, as a reviewer would search for it ("Biometric punch sync via API",
  not "Integration").
- module: one of ${MODULES.join(" | ")}.
- body: 2–6 sentences in British English stating what is possible, how it is configured or delivered,
  and the boundary (prerequisites, limits, what is not covered). Facts only — nothing the pages do not
  say. No marketing language, no "we", no client names.
- availability: ${AVAILABILITIES.join(" | ")} — "standard" when it ships with the product,
  "configurable" when it needs setup or a partner, "roadmap" when the document says it is planned,
  "not_available" when the document says it is not supported.
- tags: 2–6 short lower-case topic tags.

Skip headings, tables of contents, legal boilerplate, and anything already in ALREADY CAPTURED.
Return an empty list when the pages contain no capability.`;
