import { describe, expect, it } from "vitest";

import { formatDate } from "./dates";
import { firstLine, pastedDocument, pastedPages, questionsFromLines, quickCounts, quickInputSchema, quickPermissions, quickStage, quickTitle, QUICK_PAGE_CHARS, QUICK_TITLE_MAX } from "./quick";

/**
 * Quick Q&A: pasted or uploaded questions drafted straight away. These are
 * the pure parts — what the form accepts, how a session is named, how a
 * paste becomes pages, the line-split fallback, counts, permissions and
 * which job the progress strip shows.
 */

describe("quickInputSchema", () => {
  it("needs a real paste for the paste source, and nothing for a document", () => {
    const short = quickInputSchema.safeParse({ source: "paste", text: "hi", context: "", clientId: "" });
    expect(short.success).toBe(false);
    expect(short.success ? [] : short.error.issues.map((i) => i.path.join("."))).toContain("text");
    expect(quickInputSchema.safeParse({ source: "paste", text: "Does it do payroll?", context: "", clientId: "" }).success).toBe(true);
    expect(quickInputSchema.safeParse({ source: "document", text: "", context: "", clientId: "" }).success).toBe(true);
  });

  it("caps the context, and turns an empty client into null", () => {
    expect(quickInputSchema.safeParse({ source: "document", text: "", context: "x".repeat(4_001), clientId: "" }).success).toBe(false);
    const ok = quickInputSchema.parse({ source: "document", text: "", context: "Retail client", clientId: "" });
    expect(ok.clientId).toBeNull();
    expect(quickInputSchema.safeParse({ source: "document", text: "", context: "", clientId: "not-a-uuid" }).success).toBe(false);
    expect(quickInputSchema.parse({ source: "document", text: "", context: "", clientId: "3f214b49-f65f-4a3b-88c9-9d0698b914c4" }).clientId).toBe("3f214b49-f65f-4a3b-88c9-9d0698b914c4");
  });
});

describe("quickTitle / firstLine", () => {
  it("prefers the first line of the context, then the first question, then a dated fallback", () => {
    expect(quickTitle({ context: "Renewal for a 3,000-headcount bank\nmore detail", firstQuestion: "Q", date: "2026-09-16" })).toBe("Renewal for a 3,000-headcount bank");
    expect(quickTitle({ context: "", firstQuestion: "Does the platform support shift rostering?", date: "2026-09-16" })).toBe("Does the platform support shift rostering?");
    expect(quickTitle({ context: "  ", firstQuestion: null, date: "2026-09-16" })).toBe(`Quick Q&A · ${formatDate("2026-09-16")}`);
  });

  it("clips long titles between words", () => {
    const long = Array(30).fill("payroll").join(" ");
    const title = quickTitle({ context: long, firstQuestion: null, date: "2026-09-16" });
    expect(title.length).toBeLessThanOrEqual(QUICK_TITLE_MAX + 1);
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toMatch(/payrol…$/);
    expect(firstLine("\n\n  first  \nsecond")).toBe("first");
    expect(firstLine("   ")).toBeNull();
  });
});

describe("pastedPages / pastedDocument", () => {
  it("keeps a short paste on one page and preserves the text", () => {
    const pages = pastedPages("Q1\r\nQ2\r\n\r\nQ3");
    expect(pages).toEqual([{ page: 1, text: "Q1\nQ2\n\nQ3" }]);
  });

  it("splits long pastes on paragraph boundaries, never above the page size", () => {
    const paragraph = "word ".repeat(500).trim(); // ~2,500 chars
    const pages = pastedPages([paragraph, paragraph, paragraph].join("\n\n"));
    expect(pages.map((p) => p.page)).toEqual([1, 2]);
    expect(pages.every((p) => p.text.length <= QUICK_PAGE_CHARS)).toBe(true);
    expect(pages[0].text.split("\n\n")).toHaveLength(2);
    expect(pages.map((p) => p.text).join("\n\n")).toBe([paragraph, paragraph, paragraph].join("\n\n"));
  });

  it("hard-splits a single oversize paragraph", () => {
    const pages = pastedPages("x".repeat(13_000));
    expect(pages).toHaveLength(3);
    expect(pages.every((p) => p.text.length <= QUICK_PAGE_CHARS)).toBe(true);
    expect(pages.map((p) => p.text).join("")).toBe("x".repeat(13_000));
  });

  it("wraps the paste as a parsed document", () => {
    const doc = pastedDocument("Does it do payroll?\nDoes it do leave?");
    expect(doc.kind).toBe("text");
    expect(doc.pages).toHaveLength(1);
    expect(doc.stats).toEqual({ pages: 1, chars: doc.text.length });
  });
});

describe("questionsFromLines", () => {
  it("strips numbering and bullets, drops short lines, numbers refs", () => {
    const qs = questionsFromLines("1. Does the platform support shift rostering?\n- How is payroll reconciled at month end?\n• short\nQ3: Can employees see payslips on mobile?\n\n(4) Is there an API for attendance devices?");
    expect(qs.map((q) => q.questionText)).toEqual([
      "Does the platform support shift rostering?",
      "How is payroll reconciled at month end?",
      "Can employees see payslips on mobile?",
      "Is there an API for attendance devices?",
    ]);
    expect(qs.map((q) => q.refNo)).toEqual(["R-001", "R-002", "R-003", "R-004"]);
    expect(qs[0]).toMatchObject({ sectionTitle: "General", owner: "joint", moduleHint: "general", questionType: "descriptive", isMandatory: false, sourcePage: 1, existing: null });
    expect(qs[3].rawMeta).toEqual({ Line: "6" });
  });
});

describe("quickCounts / quickPermissions", () => {
  it("counts drafted, approved and promoted rows", () => {
    expect(quickCounts([{ status: "approved", kbAnswerId: "k" }, { status: "ai_draft", kbAnswerId: null }, { status: null, kbAnswerId: null }])).toEqual({ total: 3, drafted: 2, undrafted: 1, approved: 1, inKb: 1 });
  });

  it("mirrors the role matrix", () => {
    expect(quickPermissions("sales")).toMatchObject({ create: true, draft: true, approve: false, promote: false });
    expect(quickPermissions("reviewer")).toMatchObject({ create: false, approve: true, promote: true, remove: false });
    expect(quickPermissions("consultant").remove).toBe(true);
    expect(quickPermissions("consultant")).toMatchObject({ create: true, approve: true, promote: true, edit: true });
  });
});

describe("quickStage", () => {
  const now = new Date("2026-09-16T10:00:00Z");
  const job = (status: string, minutesAgo = 0, finishedMinutesAgo: number | null = null) => ({
    status,
    createdAt: new Date(now.getTime() - minutesAgo * 60_000),
    finishedAt: finishedMinutesAgo === null ? null : new Date(now.getTime() - finishedMinutesAgo * 60_000),
  });

  it("shows the intake while it runs, then the draft job, then nothing", () => {
    expect(quickStage({ intake: job("running"), draft: null, questionCount: 0, now })).toEqual({ show: "intake", failed: false, stale: false, active: true });
    expect(quickStage({ intake: job("done", 5, 1), draft: job("queued"), questionCount: 3, now })).toEqual({ show: "draft", failed: false, stale: false, active: true });
    expect(quickStage({ intake: job("done", 5, 4), draft: job("done", 3, 1), questionCount: 3, now })).toEqual({ show: null, failed: false, stale: false, active: false });
  });

  it("flags failures and jobs nobody picked up", () => {
    expect(quickStage({ intake: job("failed"), draft: null, questionCount: 0, now })).toMatchObject({ show: "intake", failed: true, active: false });
    expect(quickStage({ intake: job("queued", 6), draft: null, questionCount: 0, now })).toMatchObject({ show: "intake", stale: true, active: false });
    expect(quickStage({ intake: job("done", 3, 2), draft: job("failed", 1, 0), questionCount: 3, now })).toMatchObject({ show: "draft", failed: true });
  });

  it("is idle once intake is done and nothing is drafting — the page offers what to draft", () => {
    expect(quickStage({ intake: job("done", 1, 0), draft: null, questionCount: 3, now })).toEqual({ show: null, failed: false, stale: false, active: false });
    expect(quickStage({ intake: job("done", 10, 5), draft: null, questionCount: 3, now })).toMatchObject({ show: null, active: false });
  });
});
