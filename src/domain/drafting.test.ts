import { describe, expect, it } from "vitest";

import { ANSWER_MAX_CHARS, buildDraftUserMessage, draftOutputSchema, fitAnswer, numberPassages, sanitiseDraft, stripCitationMarkers } from "./drafting";

describe("numberPassages", () => {
  it("numbers knowledge-base entries first, then approved answers, continuing the count", () => {
    const numbered = numberPassages(
      [{ id: "e1", label: "Darwinbox · Payroll · Statutory", text: "PF, ESI…", kind: "kb_entry" }],
      [{ id: "a1", label: "Approved answer (Core HR)", text: "We did X.", kind: "approved_answer" }],
    );
    expect(numbered.map((p) => [p.n, p.id, p.kind])).toEqual([
      [1, "e1", "kb_entry"],
      [2, "a1", "approved_answer"],
    ]);
  });
});

describe("buildDraftUserMessage", () => {
  const base = {
    question: { refNo: "B.1", questionText: "Process Indian payroll for two entities.", acceptanceCriteria: "PF/ESI/TDS per entity", questionType: "compliance" as const, owner: "darwinbox" as const, moduleHint: "payroll" as const, isMandatory: true },
    passages: numberPassages([{ id: "e1", label: "Darwinbox · Payroll", text: "Multi-entity payroll…", kind: "kb_entry" as const }], []),
  };

  it("lists passages by number and states the owner and question type", () => {
    const msg = buildDraftUserMessage(base);
    expect(msg).toContain("[1] Darwinbox · Payroll");
    expect(msg).toContain("Multi-entity payroll…");
    expect(msg).toContain("OWNER: darwinbox");
    expect(msg).toContain("TYPE: compliance");
    expect(msg).toContain("MANDATORY: yes");
    expect(msg).toContain("Expected: PF/ESI/TDS per entity");
  });

  it("includes the reviewer's instruction and the previous draft when regenerating", () => {
    const msg = buildDraftUserMessage({ ...base, instruction: "shorter, mention SAP migration", previousDraft: "Old text." });
    expect(msg).toContain("REVIEWER INSTRUCTION: shorter, mention SAP migration");
    expect(msg).toContain("PREVIOUS DRAFT:\nOld text.");
  });

  it("says so when there are no passages, so the model marks the answer partial", () => {
    const msg = buildDraftUserMessage({ ...base, passages: [] });
    expect(msg).toContain("(no passages retrieved");
  });
});

describe("draftOutputSchema", () => {
  it("accepts a complete draft and rejects a citation without a number", () => {
    const ok = draftOutputSchema.safeParse({
      compliance: "fully",
      confidence: 0.86,
      draft_text: "Fully compliant. …[1]",
      citations: [{ n: 1, why: "statutory coverage" }],
      open_points: [],
    });
    expect(ok.success).toBe(true);
    const bad = draftOutputSchema.safeParse({ compliance: "fully", confidence: 1.4, draft_text: "x", citations: [{ why: "?" }], open_points: [] });
    expect(bad.success).toBe(false);
  });
});

describe("answer length (every generated answer is at most ANSWER_MAX_CHARS)", () => {
  it("is 200 characters", () => {
    expect(ANSWER_MAX_CHARS).toBe(200);
  });

  it("strips inline citation markers and the space they leave behind", () => {
    expect(stripCitationMarkers("Fully compliant [1][2]. Leave rules [brief] apply [3].")).toBe("Fully compliant. Leave rules apply.");
    expect(stripCitationMarkers("  Two   spaces\nand a newline ")).toBe("Two spaces and a newline");
  });

  it("leaves a short answer alone", () => {
    expect(fitAnswer("Supported natively: PF, ESI and TDS run per entity.")).toEqual({ text: "Supported natively: PF, ESI and TDS run per entity.", truncated: false });
  });

  it("cuts an over-long answer at the last sentence end that fits", () => {
    const first = "Supported natively: statutory payroll runs per entity with PF, ESI, PT and TDS computed by the engine each cycle.";
    const second = " Reconciliation reports and bank files are generated after every run and can be scheduled for finance.";
    const third = " A third sentence that pushes the whole answer well past the limit for good measure.";
    expect(first.length).toBeLessThanOrEqual(200);
    expect((first + second).length).toBeGreaterThan(200);
    expect(fitAnswer(first + second + third)).toEqual({ text: first, truncated: true });
  });

  it("falls back to a word boundary when a single sentence is too long, never mid-word", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const fitted = fitAnswer(words);
    expect(fitted.truncated).toBe(true);
    expect(fitted.text.length).toBeLessThanOrEqual(200);
    expect(fitted.text.endsWith(".")).toBe(true);
    expect(words.startsWith(fitted.text.slice(0, -1))).toBe(true);
    expect(fitted.text.slice(0, -1).endsWith("word")).toBe(false);
  });

  it("sanitiseDraft strips markers and reports when the text is over the limit", () => {
    const given = numberPassages([{ id: "e1", label: "L", text: "T", kind: "kb_entry" }], []);
    const short = sanitiseDraft({ compliance: "fully", confidence: 0.9, draft_text: "Supported natively: PF and ESI run per entity [1].", citations: [{ n: 1, why: "x" }], open_points: [] }, given);
    expect(short.draft_text).toBe("Supported natively: PF and ESI run per entity.");
    expect(short.overLimit).toBe(false);
    const long = sanitiseDraft({ compliance: "fully", confidence: 0.9, draft_text: "x".repeat(201), citations: [], open_points: [] }, given);
    expect(long.overLimit).toBe(true);
  });
});
