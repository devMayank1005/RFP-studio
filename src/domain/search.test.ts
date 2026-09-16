import { describe, expect, it } from "vitest";

import { clipText, escapeLike, filterStatic, hitHref, hitValue, isSearchable, likePattern, matchesStatic, normaliseQuery, SEARCH_MAX_LENGTH, type QuestionHit, type RfpHit } from "./search";

/**
 * ⌘K search: what a typed query becomes (server pattern, static filter),
 * where a hit leads, and how results are kept distinct for cmdk.
 */

const rfp = (over: Partial<RfpHit> = {}): RfpHit => ({ kind: "rfp", id: "r1", title: "Apex — HRMS", clientName: "Apex", status: "in_review", ...over });
const question = (over: Partial<QuestionHit> = {}): QuestionHit => ({ kind: "question", id: "q1", rfpId: "r1", rfpTitle: "Apex — HRMS", refNo: "A.1", text: "Single sign-on", ...over });

describe("normaliseQuery / isSearchable", () => {
  it("trims, collapses whitespace and caps the length", () => {
    expect(normaliseQuery("  a \n  b ")).toBe("a b");
    expect(normaliseQuery("x".repeat(SEARCH_MAX_LENGTH + 20))).toHaveLength(SEARCH_MAX_LENGTH);
  });

  it("needs two characters after trimming", () => {
    expect(isSearchable("")).toBe(false);
    expect(isSearchable(" a ")).toBe(false);
    expect(isSearchable("ab")).toBe(true);
    expect(isSearchable("A.1")).toBe(true);
  });
});

describe("escapeLike / likePattern", () => {
  it("escapes the LIKE wildcards and the escape character itself, backslash first", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("\\")).toBe("\\\\");
    expect(escapeLike("\\%")).toBe("\\\\\\%");
  });

  it("wraps the normalised query in wildcards", () => {
    expect(likePattern("  50% uptime ")).toBe("%50\\% uptime%");
  });
});

describe("clipText", () => {
  it("leaves short text alone and cuts long text between words", () => {
    expect(clipText("Short question")).toBe("Short question");
    const long = Array(60).fill("word").join(" ");
    const clipped = clipText(long, 120);
    expect(clipped.length).toBeLessThanOrEqual(121);
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipped).not.toMatch(/wor…$/);
    expect(clipText("line one\n\nline two")).toBe("line one line two");
  });
});

describe("hitHref / hitValue", () => {
  it("sends an RFP to where it lives and a question to its row", () => {
    expect(hitHref(rfp({ status: "draft" }))).toBe("/rfps/r1/setup");
    expect(hitHref(rfp({ status: "parsing" }))).toBe("/rfps/r1/setup");
    expect(hitHref(rfp({ status: "in_review" }))).toBe("/rfps/r1/workspace");
    expect(hitHref(question())).toBe("/rfps/r1/workspace?row=q1");
  });

  it("keeps values unique across kinds even with the same id", () => {
    expect(hitValue(rfp({ id: "same" }))).not.toBe(hitValue(question({ id: "same" })));
    expect(hitValue(rfp({ title: "Dup" }))).not.toBe(hitValue(rfp({ id: "r2", title: "Dup" })));
  });
});

describe("matchesStatic / filterStatic", () => {
  const items = [
    { title: "Dashboard" },
    { title: "Knowledge base" },
    { title: "Switch to late shift", keywords: ["theme", "dark", "light"] },
  ];

  it("matches every token in any order, case-insensitively, against label and keywords", () => {
    expect(matchesStatic("Knowledge base", "know")).toBe(true);
    expect(matchesStatic("Knowledge base", "base KNOW")).toBe(true);
    expect(matchesStatic("Switch to late shift", "dark", ["theme", "dark"])).toBe(true);
    expect(matchesStatic("Dashboard", "zzzz")).toBe(false);
  });

  it("returns everything for an empty query and only matches otherwise", () => {
    expect(filterStatic(items, "  ")).toHaveLength(3);
    expect(filterStatic(items, "know").map((i) => i.title)).toEqual(["Knowledge base"]);
    expect(filterStatic(items, "theme").map((i) => i.title)).toEqual(["Switch to late shift"]);
    expect(filterStatic(items, "zzzz")).toEqual([]);
  });
});
