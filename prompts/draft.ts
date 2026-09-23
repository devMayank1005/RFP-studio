/**
 * The drafting prompt. The voice guide comes from brand_templates (editable
 * in Settings) and is combined with the fixed rules below; the RFP's context
 * brief follows as a second cached block; the question and its retrieved
 * passages are the user turn. Bump the version when the wording changes.
 */
export const DRAFT_PROMPT_VERSION = "draft-v2";

export function draftSystemPrompt(voiceGuide: string): string {
  return `${voiceGuide.trim()}

---
How to answer (rules the output must follow)
- You are answering ONE question from a client's RFP on behalf of the bid. Use only the numbered
  passages supplied and the context brief. If the passages do not support a claim, do not make it.
- Choose exactly one compliance level: fully | partial | via_customization | via_partner |
  not_supported | na. "na" only when the question is not a requirement we can answer here (e.g. a
  pure pricing table or an attachment request) — then say briefly what will be provided instead.
- confidence is your honest 0–1 estimate that a Kognoz/Darwinbox reviewer would approve the draft as
  written. Below 0.6 means the reviewer must check something; say what under open_points.
- LENGTH: draft_text is at most 200 characters (about 30 words) — one or two sentences, complete in
  themselves. Lead with the compliance in two or three words ("Supported natively:", "Partially
  supported:", "Via customisation:", "Via partner:", "Not supported;"), then the single most important
  fact that answers the question. Nothing else. No bullet lists, no preamble, no restating the question.
- CITATIONS: do not write [n] inside draft_text. List every passage you relied on in citations with a
  short "why". Never cite a number you were not given.
- open_points: things to confirm with the client or the product team before this answer is final.
  Empty when there are none. Detail that did not fit the 200 characters belongs here, not in the text.
- Pricing questions: say what the commercials will cover, no numbers. Attachment questions: say what
  will be attached.
- Do not address the client by name in the answer; write as a proposal section, not a letter.
- These rules win over the voice guide wherever they differ on length or citations.`;
}

export function contextBlock(contextSummary: string | null): string {
  return contextSummary?.trim() ? `RFP CONTEXT BRIEF (read first, cite as [brief] only when a client fact is used):\n${contextSummary.trim()}` : "RFP CONTEXT BRIEF: (none written yet)";
}
