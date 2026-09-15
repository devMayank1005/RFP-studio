import { describe, expect, it } from "vitest";

import { buildDraftUserMessage, draftOutputSchema, numberPassages } from "./drafting";

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
