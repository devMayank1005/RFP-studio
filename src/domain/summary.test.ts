import { describe, expect, it } from "vitest";

import { buildSummaryUserMessage, flattenSummary, sanitiseSummary, SUMMARY_CAPS, summaryOutputSchema, type SummaryInput } from "./summary";

/**
 * The executive summary that opens the Word export: one Sonnet call over the
 * approved answers. These are the pure parts — what the model is shown and
 * how its output is tidied.
 */
const input = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  clientName: "Apex Manufacturing",
  clientProfile: { industry: "Manufacturing", headcount: 12000 },
  rfpTitle: "Apex — HRMS implementation RFP",
  engagementType: "HRIS implementation",
  contextSummary: "Apex runs SAP today and wants one HR platform across 40 plants.",
  sectionTitles: ["Core HR", "Payroll"],
  approved: [
    { refNo: "A.1", questionText: "Single sign-on", answerText: "Darwinbox supports SAML SSO with Azure AD.", compliance: "fully" },
    { refNo: "B.2", questionText: "Biometric attendance", answerText: "Via the standard biometric API.", compliance: "partial" },
  ],
  counts: { total: 24, approved: 19, fully: 12, partial: 5, via_customization: 1, via_partner: 1, not_supported: 0, na: 0 },
  ...over,
});

describe("buildSummaryUserMessage", () => {
  it("shows the client, brief, counts and approved answers with refs", () => {
    const msg = buildSummaryUserMessage(input());
    expect(msg).toContain("CLIENT: Apex Manufacturing");
    expect(msg).toContain("CONTEXT BRIEF:");
    expect(msg).toContain("24 questions, 19 approved");
    expect(msg).toContain("Fully 12");
    expect(msg).toContain("[A.1] Single sign-on → Darwinbox supports SAML SSO with Azure AD.");
    expect(msg).toContain("SECTIONS: Core HR; Payroll");
  });

  it("caps long answers and says when the list was cut", () => {
    const long = Array.from({ length: 400 }, (_, i) => ({ refNo: `Q.${i}`, questionText: "q".repeat(100), answerText: "a".repeat(SUMMARY_CAPS.answerChars + 200), compliance: "fully" as const }));
    const msg = buildSummaryUserMessage(input({ approved: long }));
    expect(msg.length).toBeLessThan(SUMMARY_CAPS.approvedChars + 5_000);
    expect(msg).toMatch(/\(and \d+ more\)/);
    expect(msg).not.toContain("a".repeat(SUMMARY_CAPS.answerChars + 1));
  });
});

describe("sanitiseSummary", () => {
  it("trims, drops blanks and caps the lists", () => {
    const out = sanitiseSummary({
      paragraphs: ["  One  para.  ", "", "Two", "Three", "Four", "Five", "Six", "Seven"],
      highlights: [" a ", "", "b", "c", "d", "e", "f", "g", "h"],
    });
    expect(out.paragraphs).toEqual(["One para.", "Two", "Three", "Four", "Five"]);
    expect(out.highlights).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("refuses an empty summary", () => {
    expect(() => sanitiseSummary({ paragraphs: ["  "], highlights: [] })).toThrow(/no usable paragraphs/);
  });

  it("matches the schema the model is constrained to", () => {
    expect(summaryOutputSchema.safeParse({ paragraphs: ["x"], highlights: [] }).success).toBe(true);
    expect(summaryOutputSchema.safeParse({ paragraphs: "x" }).success).toBe(false);
  });
});

describe("flattenSummary", () => {
  it("joins paragraphs and bullets the highlights", () => {
    expect(flattenSummary({ paragraphs: ["One.", "Two."], highlights: ["Fast", "Safe"] })).toBe("One.\n\nTwo.\n\n• Fast\n• Safe");
    expect(flattenSummary({ paragraphs: ["One."], highlights: [] })).toBe("One.");
  });
});
