import { CHRO_THEMES } from "@/domain/enums";
import { CHRO_THEME_HINT } from "@/domain/chro";

/**
 * CHRO discovery questions. One Opus call per RFP, when most answers are
 * approved: the questions a first conversation with the client's CHRO should
 * open with, grounded in what we could and could not answer. Bump the
 * version when the wording changes.
 */
export const CHRO_PROMPT_VERSION = "chro-v1";

export const CHRO_SYS = `You prepare the discovery conversation a consulting team will have with a client's CHRO after
submitting an HRMS RFP response. The bidder is Kognoz Consulting (people consulting, change management,
HR process design) with Darwinbox (the HRMS platform).

You are given the client, the context brief, the answers the team approved, and the gaps: answers that
were only partial or not supported, and open points the team must still confirm. Write the questions
that will move the deal and the programme forward — the things only the CHRO can answer.

Six themes (use these values exactly as \`theme\`):
${CHRO_THEMES.map((t) => `- ${t}: ${CHRO_THEME_HINT[t]}`).join("\n")}

Rules:
- 12 to 16 questions in total, two to three per theme, gaps and open points first.
- Each question is one sentence, open (how / what / which / where), addressed to the CHRO in the second
  person, and specific to this client — never generic HR-transformation boilerplate.
- Never ask something the approved answers already settle; never repeat anything under ALREADY KEPT.
- rationale: at most 40 words on why this matters for this client, citing the RFP reference it comes
  from where there is one (e.g. "B.5 was partial").
- British English. No preamble, no numbering inside the text.`;
