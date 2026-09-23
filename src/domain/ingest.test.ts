import { describe, expect, it } from "vitest";

import { buildIngestUserMessage, ingestEntrySlug, ingestOutputSchema, normaliseIngestEntries, normalisePrecedents, precedentOutputSchema, precedentSlug, sheetPrecedents } from "./ingest";

/**
 * `pnpm kb:ingest <file>` turns a Darwinbox document into knowledge-base
 * entries. The model does the reading; these pure pieces keep what it returns
 * honest: no near-empty entries, no duplicate feature per document, and a
 * stable id so re-running the same file updates instead of duplicating.
 */
describe("normaliseIngestEntries", () => {
  const good = { feature_name: "  Biometric punch sync ", module: "time_attendance" as const, body: "Punches from supported biometric devices are pulled through the API every 15 minutes and matched to the employee code; unmatched punches are held for review.", availability: "standard" as const, tags: ["Biometric", "biometric", " API "] };

  it("trims names, drops bodies too short to cite, and tidies tags", () => {
    const entries = normaliseIngestEntries([good, { ...good, feature_name: "Stub", body: "See above." }]);
    expect(entries).toHaveLength(1);
    expect(entries[0].featureName).toBe("Biometric punch sync");
    expect(entries[0].tags).toEqual(["biometric", "api"]);
  });

  it("keeps the fuller body when the same feature appears twice", () => {
    const entries = normaliseIngestEntries([
      { ...good, body: "Punches are pulled through the API and matched to the employee code every fifteen minutes." },
      { ...good, feature_name: "biometric punch sync" },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].body).toBe(good.body);
  });
});

describe("ingestEntrySlug", () => {
  it("is a stable kebab-case key from the source file and the feature name", () => {
    expect(ingestEntrySlug("Biometric API integration.pdf", "Biometric punch sync")).toBe("biometric-api-integration:biometric-punch-sync");
    expect(ingestEntrySlug("Biometric API integration.pdf", "Biometric punch sync")).toBe(ingestEntrySlug("biometric api integration.PDF", "  biometric  punch sync "));
  });
});

describe("ingestOutputSchema", () => {
  it("rejects an availability outside the vocabulary", () => {
    const bad = ingestOutputSchema.safeParse({ entries: [{ feature_name: "x", module: "payroll", body: "y", availability: "maybe", tags: [] }] });
    expect(bad.success).toBe(false);
  });
});

describe("buildIngestUserMessage", () => {
  it("names the document, lists pages with their numbers, and the features already captured", () => {
    const msg = buildIngestUserMessage({ sourceName: "Biometric API integration.pdf", pages: [{ page: 3, text: "Punch sync…" }, { page: 4, text: "Device master…" }], known: ["Biometric punch sync"] });
    expect(msg).toContain("DOCUMENT: Biometric API integration.pdf");
    expect(msg).toContain("--- page 3 ---\nPunch sync…");
    expect(msg).toContain("--- page 4 ---\nDevice master…");
    expect(msg).toContain("ALREADY CAPTURED (do not repeat): Biometric punch sync");
  });
});

describe("precedents from a past RFP response", () => {
  const raw = [
    { question: "Can payroll run per legal entity with separate PF and ESI registrations?", answer: "Fully compliant: statutory payroll runs per entity with its own PF, ESI and PT registrations [1].", module: "payroll" as const, tags: ["Payroll", "statutory"] },
    { question: "  can payroll run per legal entity with separate PF and ESI registrations? ", answer: "Yes.", module: "payroll" as const, tags: [] },
    { question: "Leave?", answer: "Short.", module: "leave" as const, tags: [] },
  ];

  it("keeps one precedent per question, strips markers, drops answers too short to reuse", () => {
    const out = normalisePrecedents(raw);
    expect(out).toHaveLength(1);
    expect(out[0].answer).toBe("Fully compliant: statutory payroll runs per entity with its own PF, ESI and PT registrations.");
    expect(out[0].tags).toEqual(["payroll", "statutory"]);
  });

  it("gives a stable slug per source and question so re-ingesting updates in place", () => {
    expect(precedentSlug("Kognoz_Vedanta_RFP_Response_FINAL (2).pptx", raw[0].question)).toBe(precedentSlug("Kognoz_Vedanta_RFP_Response_FINAL (2).pptx", raw[1].question));
    expect(precedentSlug("a.pptx", "Q1")).not.toBe(precedentSlug("b.pptx", "Q1"));
  });

  it("turns a filled requirements sheet into precedents without a model call", () => {
    const sheet: Parameters<typeof sheetPrecedents>[0] = {
      name: "Requirements",
      headers: ["Requirement", "Vendor Response", "Remarks"],
      rows: [
        { row: 2, cells: { Requirement: "Biometric punches from plants sync to attendance", "Vendor Response": "Fully compliant — the standard API pulls punches every 15 minutes and matches them to the employee code.", Remarks: "" } },
        { row: 3, cells: { Requirement: "Shift rosters for unionised workmen", "Vendor Response": "" } },
        { row: 4, cells: { Requirement: "", "Vendor Response": "Orphan answer with no question." } },
      ],
    };
    const map = { question: "Requirement", acceptanceCriteria: null, priority: null, section: null, refNo: null, existingCompliance: null, existingAnswer: "Vendor Response", existingQuestions: null, passthrough: ["Remarks"], hasQuestion: true };
    const out = sheetPrecedents(sheet, map);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ question: "Biometric punches from plants sync to attendance", module: "general" });
    expect(out[0].answer).toContain("every 15 minutes");
  });

  it("schema accepts a precedent list", () => {
    expect(precedentOutputSchema.safeParse({ precedents: raw }).success).toBe(true);
  });
});
