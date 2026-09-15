import { MODULES, OWNERS, QUESTION_TYPES } from "@/domain/enums";

/**
 * Prompts for turning a parsed RFP into questions. Versioned: bump
 * EXTRACT_PROMPT_VERSION whenever the wording changes, so a revision can say
 * which prompt produced it. The system prompts are frozen strings so prompt
 * caching hits across every chunk of every document.
 */
export const EXTRACT_PROMPT_VERSION = "extract-v1";

const SHARED_VOCAB = `
Vocabulary (use these values exactly):
- question_type: ${QUESTION_TYPES.join(" | ")}
    compliance  = "do you support X" — answered with a compliance level and a short justification
    descriptive = "describe/explain how" — answered with a paragraph
    pricing     = commercial terms, rates, fees
    yes_no      = a bare yes/no with no explanation expected
    attachment  = asks for a document, case study, certificate
- module_hint: ${MODULES.join(" | ")}
    Use the Darwinbox product module the requirement is about; use advisory / change_management /
    implementation / data_migration / commercial / general for consulting, programme and commercial items.
- owner_guess: ${OWNERS.join(" | ")}
    darwinbox = a platform capability the HRMS must have
    kognoz    = consulting, change management, process/policy design, training, PMO, org design
    joint     = needs both (implementation approach, migration, governance, commercials)
    not_applicable = not a requirement at all (an instruction, a heading, a note)
`;

export const CLASSIFY_SYS = `You classify the columns of an RFP requirements spreadsheet.

Given the header row and a few sample rows, assign every header exactly one role:
- question             the requirement or question text (exactly one column)
- acceptance_criteria  what the client expects to see to accept it
- priority             must-have / should-have / mandatory flags
- section              a section, area, module or category label
- ref_no               the client's own reference or serial number
- existing_compliance  a vendor's earlier yes / partial / no style answer
- existing_answer      a vendor's earlier written response or solution text
- existing_questions   a vendor's earlier clarification questions back to the client
- remarks              free-form comments or notes
- other                anything else the client supplied (keep it, do not interpret it)

Rules: exactly one column is the question; if two candidates exist, the one with the fuller
requirement sentences is the question and the other is acceptance_criteria or other. Never invent
columns. Keep header text verbatim in your output.`;

export const EXTRACT_SHEET_SYS = `You are preparing an HRMS RFP for a bid team (Kognoz Consulting + Darwinbox). Each input row is one
line of a client's requirements spreadsheet, already parsed. The requirement text is the client's and
must NOT be rewritten — you only classify each row.

For every input row return one output row with the same source_row:
- is_question: false for headings, instructions, blank-ish or duplicate rows; true otherwise
- section_title: the BROAD section the row belongs to — a module or theme such as "Core HR",
  "Payroll", "Leave & Attendance", "Recruiting", "Performance", "Compensation", "Data Migration &
  Integration", "Change Management". A whole RFP has roughly 8–15 sections of 10–40 rows each, never
  a section per topic. ALWAYS reuse a title from KNOWN SECTIONS when the row fits it even loosely;
  coin a new one only when nothing known applies. Keep titles identical across rows.
- question_type, module_hint, owner_guess: see the vocabulary
${SHARED_VOCAB}
Return every source_row you were given, in order, and nothing else.`;

export const EXTRACT_NARRATIVE_SYS = `You extract the questions and requirements a bidder must answer from the text of an RFP document
(PDF or Word). Pull out every distinct question, requirement or "the bidder shall" obligation.

For each one return:
- source_page: the page it appears on
- section_title: the document section it belongs to (2–5 words; reuse KNOWN SECTIONS when they fit)
- ref_no: the document's own numbering if it has one (e.g. "Q3", "4.2.1"), else null
- question_text: the question or requirement, close to verbatim, one item per entry
- question_type, is_mandatory, module_hint, owner_guess: see the vocabulary
${SHARED_VOCAB}
Do not include evaluation criteria, submission logistics or background narrative as questions —
those go into the context brief, not the question list. Do not duplicate an item that appears twice.`;

export function classifyUserMessage(headers: string[], sampleRows: Array<Record<string, string>>): string {
  return [
    "HEADERS:",
    JSON.stringify(headers),
    "",
    `SAMPLE ROWS (${sampleRows.length}):`,
    ...sampleRows.map((r) => JSON.stringify(r)),
    "",
    "Assign a role to every header.",
  ].join("\n");
}

export function sheetChunkUserMessage(
  rows: Array<{ source_row: number; text: string; extra?: Record<string, string> }>,
  knownSections: string[],
): string {
  return [
    `KNOWN SECTIONS: ${knownSections.length ? knownSections.join(" | ") : "(none yet)"}`,
    "",
    `ROWS (${rows.length}):`,
    ...rows.map((r) => JSON.stringify(r)),
  ].join("\n");
}

export function narrativeChunkUserMessage(pages: Array<{ page: number; text: string }>, knownSections: string[]): string {
  return [
    `KNOWN SECTIONS: ${knownSections.length ? knownSections.join(" | ") : "(none yet)"}`,
    "",
    ...pages.map((p) => `--- page ${p.page} ---\n${p.text}`),
  ].join("\n");
}
