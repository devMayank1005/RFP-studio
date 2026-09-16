import { describe, expect, it } from "vitest";

import { buildGeneraliseUserMessage, generaliseOutputSchema, sanitiseGeneralised } from "./kb";

/**
 * Promoting an approved answer into the knowledge base: the model rewrites
 * the pair so it stands on its own for the next RFP. These are the pure parts —
 * the prompt's user turn, the schema, and the scrub that guarantees a client's
 * name never leaks into the shared corpus even if the model misses one.
 */
describe("buildGeneraliseUserMessage", () => {
  const input = {
    clientName: "Vedanta",
    questionText: "Can the system process payroll for our two Indian entities?",
    acceptanceCriteria: "PF/ESI/TDS per entity",
    answerText: "Yes — Darwinbox runs multi-entity payroll [1] with statutory filings per entity.",
    moduleHint: "payroll" as const,
  };

  it("carries the client name, question, expected outcome, answer and module so the model can generalise", () => {
    const msg = buildGeneraliseUserMessage(input);
    expect(msg).toContain("CLIENT: Vedanta");
    expect(msg).toContain("QUESTION: Can the system process payroll");
    expect(msg).toContain("Expected: PF/ESI/TDS per entity");
    expect(msg).toContain("APPROVED ANSWER:\nYes — Darwinbox runs multi-entity payroll");
    expect(msg).toContain("MODULE HINT: payroll");
  });

  it("omits the expected-outcome line when the client gave none", () => {
    expect(buildGeneraliseUserMessage({ ...input, acceptanceCriteria: null })).not.toContain("Expected:");
  });
});

describe("generaliseOutputSchema", () => {
  it("accepts a generalised pair and rejects an unknown module", () => {
    const ok = generaliseOutputSchema.safeParse({ canonical_question: "q", canonical_answer: "a", module: "payroll", tags: ["multi-entity"] });
    expect(ok.success).toBe(true);
    const bad = generaliseOutputSchema.safeParse({ canonical_question: "q", canonical_answer: "a", module: "hr-stuff", tags: [] });
    expect(bad.success).toBe(false);
  });
});

describe("sanitiseGeneralised", () => {
  const out = { canonical_question: "  Multi-entity payroll?  ", canonical_answer: "Supported.", module: "payroll" as const, tags: ["Payroll", " payroll", "multi-entity", ""] };

  it("replaces the client's name, in any case and possessive form, with a neutral phrase", () => {
    const scrubbed = sanitiseGeneralised(
      { ...out, canonical_answer: "Vedanta's two entities run on one payroll. VEDANTA also gets PF filings; for Vedanta Limited this is standard." },
      "Vedanta Limited",
    );
    expect(scrubbed.canonical_answer).toBe("The client's two entities run on one payroll. The client also gets PF filings; for the client this is standard.");
    expect(scrubbed.canonical_answer.toLowerCase()).not.toContain("vedanta");
  });

  it("strips inline citation markers, which point at passages the next RFP will not have", () => {
    const scrubbed = sanitiseGeneralised({ ...out, canonical_answer: "Supported [1] with statutory filings [12]. Roadmap: none." }, "Vedanta");
    expect(scrubbed.canonical_answer).toBe("Supported with statutory filings. Roadmap: none.");
  });

  it("trims text and lower-cases, de-duplicates and caps the tags", () => {
    const scrubbed = sanitiseGeneralised({ ...out, tags: [...out.tags, "a", "b", "c", "d", "e", "f", "g"] }, "Vedanta");
    expect(scrubbed.canonical_question).toBe("Multi-entity payroll?");
    expect(scrubbed.tags.slice(0, 2)).toEqual(["payroll", "multi-entity"]);
    expect(scrubbed.tags).toHaveLength(8);
  });

  it("leaves a name that is a common word alone when the client name is too short to scrub safely", () => {
    const scrubbed = sanitiseGeneralised({ ...out, canonical_answer: "The go-live plan." }, "Go");
    expect(scrubbed.canonical_answer).toBe("The go-live plan.");
  });
});
