import { MODULES } from "@/domain/enums";

/**
 * A past RFP response — a filled questionnaire, a proposal deck, or a chat
 * transcript in which answers were drafted — becomes reusable precedents:
 * question/answer pairs the drafting engine retrieves alongside knowledge-base
 * entries. Bump the version when the wording changes.
 */
export const PRECEDENTS_PROMPT_VERSION = "precedents-v1";

export const PRECEDENTS_SYS = `You read a past RFP response from Kognoz Consulting (a Darwinbox implementation and advisory partner)
and extract the question/answer pairs a future bid can reuse.

For every client requirement or question the pages answer, write one precedent:
- question: the requirement or question in one line, as the client asked it (keep their wording where
  it is clear; otherwise state it plainly).
- answer: our answer as given, in 1–3 sentences of British English, complete in itself. Keep the
  compliance stance and the specific facts (modules, integrations, methods, limits). Remove every client
  name and every [n] marker. Do not add anything the pages do not say.
- module: one of ${MODULES.join(" | ")}.
- tags: 2–6 short lower-case topic tags.

Skip cover pages, agendas, pricing tables, legal terms, and anything already in ALREADY CAPTURED.
Return an empty list when the pages contain no answered requirement.`;
