import { describe, expect, it } from "vitest";

import {
  assignSortOrders,
  buildChroUserMessage,
  CHRO_CAPS,
  chroCounts,
  chroOutputSchema,
  chroReadiness,
  groupByTheme,
  sanitiseChroOutput,
  selectChroSources,
  sortChroRows,
  swapNeighbour,
  type ChroSourceRow,
} from "./chro";
import { CHRO_THEMES, type ChroTheme } from "./enums";

/**
 * CHRO discovery questions: once most answers are approved, Opus proposes the
 * 12–16 questions a CHRO conversation should open with. These are the pure
 * parts — when the RFP is ready, what the model is shown, what comes back,
 * and how the reviewer's curated list is ordered.
 */
const row = (over: Partial<ChroSourceRow>): ChroSourceRow => ({ refNo: "A.1", questionText: "Q", status: "approved", compliance: "fully", answerText: "Yes.", openPoints: [], ...over });

describe("chroReadiness", () => {
  it("is ready at 80 % approved and not before", () => {
    expect(chroReadiness({ approved: 8, total: 10 })).toEqual({ approved: 8, total: 10, pct: 80, ready: true });
    expect(chroReadiness({ approved: 7, total: 10 }).ready).toBe(false);
    expect(chroReadiness({ approved: 7, total: 24 }).pct).toBe(29);
  });

  it("is never ready with no questions", () => {
    expect(chroReadiness({ approved: 0, total: 0 })).toEqual({ approved: 0, total: 0, pct: 0, ready: false });
  });
});

describe("selectChroSources", () => {
  it("splits approved answers from the gaps a CHRO should hear about", () => {
    const rows = [
      row({ refNo: "A.1" }),
      row({ refNo: "A.2", status: "ai_draft" }),
      row({ refNo: "B.1", status: "approved", compliance: "partial" }),
      row({ refNo: "B.2", status: "edited", compliance: "not_supported", answerText: null }),
      row({ refNo: "C.1", status: "approved", openPoints: ["Confirm entity count"] }),
    ];
    const { approved, gaps } = selectChroSources(rows);
    expect(approved.map((r) => r.refNo)).toEqual(["A.1", "B.1", "C.1"]);
    expect(gaps.map((r) => r.refNo)).toEqual(["B.1", "B.2", "C.1"]);
  });
});

describe("buildChroUserMessage", () => {
  const base = {
    clientName: "Vedanta",
    clientProfile: { industry: "Mining", headcount: 64000 },
    rfpTitle: "HR transformation",
    engagementType: "hris_implementation",
    contextSummary: "Two entities, SAP today.",
    approved: [row({ refNo: "A.1", questionText: "Multi-entity payroll?", answerText: "Yes, per entity." })],
    gaps: [row({ refNo: "B.2", questionText: "Union rosters?", compliance: "partial", openPoints: ["Confirm shift rules"] })],
    keptQuestions: [{ theme: "mandate_vision" as const, questionText: "What does success look like in year one?" }],
  };

  it("lays out client, brief, approved answers, gaps and the questions already kept", () => {
    const msg = buildChroUserMessage(base);
    expect(msg).toContain("CLIENT: Vedanta");
    expect(msg).toContain('"headcount":64000');
    expect(msg).toContain("RFP: HR transformation (hris_implementation)");
    expect(msg).toContain("CONTEXT BRIEF:\nTwo entities, SAP today.");
    expect(msg).toContain("APPROVED ANSWERS (1):\n- [A.1] Multi-entity payroll? → Yes, per entity.");
    expect(msg).toContain("GAPS AND OPEN POINTS (1):\n- [B.2] Union rosters? · partial · open: Confirm shift rules");
    expect(msg).toContain("ALREADY KEPT (do not repeat):\n- [mandate_vision] What does success look like in year one?");
    expect(msg).toContain("Write 12–16 questions.");
  });

  it("prints (none) for empty sections", () => {
    const msg = buildChroUserMessage({ ...base, contextSummary: null, approved: [], gaps: [], keptQuestions: [] });
    expect(msg).toContain("CONTEXT BRIEF: (none)");
    expect(msg).toContain("APPROVED ANSWERS (0): (none)");
    expect(msg).toContain("GAPS AND OPEN POINTS (0): (none)");
    expect(msg).toContain("ALREADY KEPT (do not repeat): (none)");
  });

  it("caps each answer and the whole approved section so a 300-row RFP still fits", () => {
    const long = "x".repeat(CHRO_CAPS.answerChars + 500);
    const many = Array.from({ length: 200 }, (_, i) => row({ refNo: `R.${i}`, answerText: long }));
    const msg = buildChroUserMessage({ ...base, approved: many });
    const section = msg.slice(msg.indexOf("APPROVED ANSWERS"), msg.indexOf("GAPS AND OPEN POINTS"));
    expect(section.length).toBeLessThanOrEqual(CHRO_CAPS.approvedChars + 400);
    expect(section).toContain("…");
    expect(section).toMatch(/\(and \d+ more\)/);
  });
});

describe("chroOutputSchema + sanitiseChroOutput", () => {
  const q = (n: number, theme: ChroTheme = "mandate_vision") => ({ theme, question_text: `Question ${n}?`, rationale: `Because ${n}.` });

  it("rejects an unknown theme", () => {
    expect(chroOutputSchema.safeParse({ questions: [{ theme: "vibes", question_text: "?", rationale: "" }] }).success).toBe(false);
  });

  it("trims, drops blanks and duplicates, and caps at 16", () => {
    const out = chroOutputSchema.parse({
      questions: [...Array.from({ length: 20 }, (_, i) => q(i)), { theme: "tech_ai", question_text: "  question 3?  ", rationale: "dupe" }, { theme: "tech_ai", question_text: "   ", rationale: "blank" }],
    });
    const cleaned = sanitiseChroOutput(out);
    expect(cleaned).toHaveLength(16);
    expect(cleaned.map((c) => c.questionText)).not.toContain("question 3?");
  });

  it("refuses a set too small to be a discovery agenda", () => {
    expect(() => sanitiseChroOutput({ questions: Array.from({ length: 5 }, (_, i) => q(i)) })).toThrow(/expected 12–16/);
  });
});

describe("ordering", () => {
  const mk = (id: string, theme: (typeof CHRO_THEMES)[number], sortOrder: number, status: "suggested" | "kept" | "dropped" = "suggested") => ({ id, theme, sortOrder, status, createdAt: new Date(2026, 8, 16, 10, Number(id.replace(/\D/g, "")) || 0) });

  it("sortChroRows orders by theme, then position", () => {
    const rows = [mk("t2", "tech_ai", 301), mk("m2", "mandate_vision", 1), mk("m1", "mandate_vision", 0), mk("g1", "governance_culture", 500)];
    expect(sortChroRows(rows).map((r) => r.id)).toEqual(["m1", "m2", "t2", "g1"]);
  });

  it("groupByTheme always yields the six themes in order, empty ones included", () => {
    const groups = groupByTheme([mk("t1", "tech_ai", 300)]);
    expect(groups.map((g) => g.theme)).toEqual([...CHRO_THEMES]);
    expect(groups.find((g) => g.theme === "tech_ai")?.rows).toHaveLength(1);
    expect(groups.find((g) => g.theme === "mandate_vision")?.rows).toHaveLength(0);
  });

  it("chroCounts tallies kept, dropped and suggested", () => {
    expect(chroCounts([mk("a", "tech_ai", 0, "kept"), mk("b", "tech_ai", 1, "kept"), mk("c", "tech_ai", 2, "dropped"), mk("d", "tech_ai", 3)])).toEqual({ kept: 2, dropped: 1, suggested: 1 });
  });

  it("assignSortOrders continues after the rows a theme already has", () => {
    const existing = [mk("k1", "tech_ai", 300, "kept"), mk("k2", "tech_ai", 301, "kept")];
    const fresh = [{ theme: "tech_ai" as const }, { theme: "mandate_vision" as const }, { theme: "tech_ai" as const }];
    expect(assignSortOrders(existing, fresh)).toEqual([302, 0, 303]);
  });

  it("swapNeighbour moves a row one place and returns null at the edges", () => {
    const rows = [mk("a", "tech_ai", 300), mk("b", "tech_ai", 301), mk("c", "tech_ai", 302)];
    expect(swapNeighbour(rows, "b", "up")).toEqual([
      { id: "b", sortOrder: 300 },
      { id: "a", sortOrder: 301 },
    ]);
    expect(swapNeighbour(rows, "a", "up")).toBeNull();
    expect(swapNeighbour(rows, "c", "down")).toBeNull();
  });
});

import { isStaleQueuedJob } from "./chro";

describe("isStaleQueuedJob", () => {
  const now = new Date("2026-09-16T10:00:00Z");
  it("treats a queued job older than five minutes as dead, and anything else as live", () => {
    expect(isStaleQueuedJob({ status: "queued", createdAt: "2026-09-16T09:50:00Z" }, now)).toBe(true);
    expect(isStaleQueuedJob({ status: "queued", createdAt: "2026-09-16T09:58:00Z" }, now)).toBe(false);
    expect(isStaleQueuedJob({ status: "running", createdAt: "2026-09-16T09:00:00Z" }, now)).toBe(false);
    expect(isStaleQueuedJob(null, now)).toBe(false);
  });
});
