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

// ---- Knowledge base screen (Milestone 2) ----

import { KB_ENTRY_TYPES } from "./enums";
import { approvedAnswerInputSchema, embedFieldsChanged, entryTypesForTab, groupEntriesByModule, kbEntryInputSchema, parseTagInput, tabForEntryType } from "./kb";

describe("entryTypesForTab / tabForEntryType", () => {
  it("puts Darwinbox capabilities on their own tab and everything Kognoz-authored on services", () => {
    expect(entryTypesForTab("capabilities")).toEqual(["darwinbox_capability"]);
    expect(entryTypesForTab("services")).toEqual(["kognoz_service", "case_study", "boilerplate"]);
  });

  it("round-trips every entry type", () => {
    for (const type of KB_ENTRY_TYPES) expect(entryTypesForTab(tabForEntryType(type))).toContain(type);
  });
});

describe("parseTagInput", () => {
  it("splits on commas and newlines, trims, lower-cases and de-duplicates", () => {
    expect(parseTagInput("Payroll, payroll ,x\nMulti-Entity")).toEqual(["payroll", "x", "multi-entity"]);
  });
});

describe("kbEntryInputSchema", () => {
  const valid = {
    featureName: " Multi-entity payroll ",
    product: "Darwinbox",
    entryType: "darwinbox_capability",
    module: "payroll",
    availability: "standard",
    body: "Runs payroll for several legal entities in one cycle, with statutory filings produced per entity and consolidated reporting.",
    tags: "Payroll, payroll ,statutory",
  };

  it("accepts a valid entry, trims text, tidies tags and defaults isActive to true", () => {
    const result = kbEntryInputSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.featureName).toBe("Multi-entity payroll");
    expect(result.data.tags).toEqual(["payroll", "statutory"]);
    expect(result.data.isActive).toBe(true);
  });

  it("accepts tags already as an array", () => {
    const result = kbEntryInputSchema.safeParse({ ...valid, tags: ["A", "a", "b"] });
    expect(result.success && result.data.tags).toEqual(["a", "b"]);
  });

  it("rejects a body too short to cite and an unknown module", () => {
    expect(kbEntryInputSchema.safeParse({ ...valid, body: "Too short to be a passage." }).success).toBe(false);
    expect(kbEntryInputSchema.safeParse({ ...valid, module: "hr-stuff" }).success).toBe(false);
  });
});

describe("approvedAnswerInputSchema", () => {
  it("requires a real question and answer", () => {
    expect(approvedAnswerInputSchema.safeParse({ canonicalQuestion: "Can payroll run for two entities?", canonicalAnswer: "Yes, one cycle covers every entity with per-entity statutory output.", module: "payroll", tags: [] }).success).toBe(true);
    expect(approvedAnswerInputSchema.safeParse({ canonicalQuestion: "Short?", canonicalAnswer: "Yes.", module: "payroll", tags: [] }).success).toBe(false);
  });
});

describe("embedFieldsChanged", () => {
  const before = { product: "Darwinbox", module: "payroll" as const, featureName: "Multi-entity payroll", body: "Runs payroll for several entities.", tags: ["payroll"] };

  it("ignores edits that do not change the embedded text", () => {
    expect(embedFieldsChanged(before, { ...before })).toBe(false);
  });

  it("flags a change to any field the embedding is built from", () => {
    expect(embedFieldsChanged(before, { ...before, body: "Runs payroll for several entities, monthly." })).toBe(true);
    expect(embedFieldsChanged(before, { ...before, tags: ["payroll", "statutory"] })).toBe(true);
    expect(embedFieldsChanged(before, { ...before, module: "core_hr" })).toBe(true);
  });
});

describe("groupEntriesByModule", () => {
  it("groups in the canonical module order and drops empty modules", () => {
    const groups = groupEntriesByModule([
      { id: "1", module: "payroll" as const },
      { id: "2", module: "core_hr" as const },
      { id: "3", module: "payroll" as const },
    ]);
    expect(groups.map((g) => [g.module, g.rows.length])).toEqual([
      ["core_hr", 1],
      ["payroll", 2],
    ]);
  });
});
