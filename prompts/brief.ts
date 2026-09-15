/**
 * The context brief: one page the drafting prompt carries as system context
 * for every answer in the RFP. Written once per RFP by Opus from the client
 * profile, any "pointers" documents and the narrative parts of the RFP.
 */
export const BRIEF_PROMPT_VERSION = "brief-v1";

export const BRIEF_SYS = `You write the context brief a bid team reads before answering an HRMS RFP. The bidder is Kognoz
Consulting (people consulting, change management, HR process design) with Darwinbox (the HRMS
platform) — a joint bid unless told otherwise.

Write in British English, plain and specific. Use only facts present in the material; where something
important is unknown, say so under "Open questions" rather than guessing. No marketing language.

Sections, as markdown headings:
1. Client at a glance — who they are, size, entities, geography, current systems
2. Why now — the trigger for this RFP and any deadline
3. What they care about most — the themes that recur across the requirements, in priority order
4. Constraints and sensitivities — unions, entities, integrations, data residency, timelines, politics
5. Implications for our answers — 4–8 bullets a drafter should keep in mind on every response
6. Open questions — what we must confirm with the client

Aim for 350–600 words. key_facts is a list of 5–12 one-line facts (with numbers where known) that a
drafter can cite directly.`;

export function briefUserMessage(input: {
  clientName: string;
  clientProfile: Record<string, unknown>;
  rfpTitle: string;
  pointers: string[];
  narrative: string;
  sampleRequirements: string[];
}): string {
  return [
    `CLIENT: ${input.clientName}`,
    `RFP: ${input.rfpTitle}`,
    `CLIENT PROFILE (from our CRM): ${JSON.stringify(input.clientProfile)}`,
    "",
    input.pointers.length ? `CLIENT POINTERS / CONTEXT DOCUMENTS:\n${input.pointers.join("\n\n---\n\n")}` : "CLIENT POINTERS: (none supplied)",
    "",
    input.narrative ? `RFP NARRATIVE (excerpt):\n${input.narrative}` : "RFP NARRATIVE: (spreadsheet-only RFP)",
    "",
    `SAMPLE REQUIREMENTS (${input.sampleRequirements.length} of the list):`,
    ...input.sampleRequirements.map((r) => `- ${r}`),
  ].join("\n");
}
