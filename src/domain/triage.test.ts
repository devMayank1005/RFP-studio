import { describe, expect, it } from "vitest";

import { triageRank, triageSort, type TriageRow } from "./triage";

const row = (over: Partial<TriageRow> & { id: string }): TriageRow => ({
  status: null,
  compliance: null,
  confidence: null,
  sortOrder: 0,
  ...over,
});

describe("triageRank", () => {
  it("puts not-supported first, then flagged, then low confidence, then undrafted, then the rest, approved last", () => {
    expect(triageRank(row({ id: "a", status: "ai_draft", compliance: "not_supported", confidence: 0.9 }))).toBe(0);
    expect(triageRank(row({ id: "b", status: "flagged", compliance: "fully", confidence: 0.9 }))).toBe(1);
    expect(triageRank(row({ id: "c", status: "ai_draft", compliance: "partial", confidence: 0.4 }))).toBe(2);
    expect(triageRank(row({ id: "d" }))).toBe(3);
    expect(triageRank(row({ id: "e", status: "ai_draft", compliance: "fully", confidence: 0.9 }))).toBe(4);
    expect(triageRank(row({ id: "f", status: "edited", compliance: "fully", confidence: null }))).toBe(4);
    expect(triageRank(row({ id: "g", status: "approved", compliance: "fully", confidence: 0.9 }))).toBe(5);
  });
});

describe("triageSort", () => {
  it("orders by rank, then confidence ascending, then sheet order", () => {
    const rows = [
      row({ id: "approved", status: "approved", compliance: "fully", confidence: 0.95, sortOrder: 0 }),
      row({ id: "high", status: "ai_draft", compliance: "fully", confidence: 0.9, sortOrder: 1 }),
      row({ id: "mid", status: "ai_draft", compliance: "fully", confidence: 0.7, sortOrder: 2 }),
      row({ id: "undrafted", sortOrder: 3 }),
      row({ id: "low", status: "ai_draft", compliance: "partial", confidence: 0.3, sortOrder: 4 }),
      row({ id: "ns", status: "ai_draft", compliance: "not_supported", confidence: 0.8, sortOrder: 5 }),
      row({ id: "flag", status: "flagged", compliance: "fully", confidence: 0.6, sortOrder: 6 }),
    ];
    expect(triageSort(rows).map((r) => r.id)).toEqual(["ns", "flag", "low", "undrafted", "mid", "high", "approved"]);
  });

  it("does not mutate its input", () => {
    const rows = [row({ id: "b", sortOrder: 1 }), row({ id: "a", sortOrder: 0 })];
    const copy = [...rows];
    triageSort(rows);
    expect(rows).toEqual(copy);
  });
});
