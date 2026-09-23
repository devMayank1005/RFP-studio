import { describe, expect, it } from "vitest";

import { COMPLIANCE_LEVELS } from "./enums";
import {
  FACET_VALUES,
  NO_FILTERS,
  activeFilterGroups,
  applyWorkspaceFilters,
  facetCounts,
  normaliseFacet,
  toggleFacet,
  type FilterableRow,
} from "./workspace-filters";

/**
 * The review workspace's filters live in the URL. One canonical spelling per
 * state: known values only, once each, in the facet's own order, and "every
 * value" written as no value at all — so the same filter is always the same
 * link, and a shared link never hides rows by accident.
 */

const row = (over: Partial<FilterableRow> = {}): FilterableRow => ({
  sectionId: "s1",
  status: null,
  owner: "joint",
  compliance: null,
  moduleHint: "general",
  questionText: "Leave accrual rules",
  refNo: "R-000",
  responsePreview: null,
  rawMeta: {},
  ...over,
});

const rows: FilterableRow[] = [
  row({ refNo: "R-001", status: null, compliance: null, owner: "kognoz", sectionId: null }),
  row({ refNo: "R-002", status: "ai_draft", compliance: "fully", owner: "darwinbox", responsePreview: "Supported natively" }),
  row({ refNo: "R-003", status: "approved", compliance: "partial", owner: "joint", rawMeta: { Priority: "Must" } }),
];

describe("normaliseFacet", () => {
  it("keeps only known values, once each, in the facet's own order", () => {
    expect(normaliseFacet(["na", "", "fully", "bogus", "fully", "not_applicable=fully"], COMPLIANCE_LEVELS)).toEqual(["fully", "na"]);
  });

  it("collapses the full set to no filter, whatever the order it arrived in", () => {
    expect(normaliseFacet([...COMPLIANCE_LEVELS].reverse(), COMPLIANCE_LEVELS)).toEqual([]);
  });
});

describe("toggleFacet", () => {
  it("adds and removes a value", () => {
    expect(toggleFacet([], "kognoz", FACET_VALUES.owner)).toEqual(["kognoz"]);
    expect(toggleFacet(["kognoz", "darwinbox"], "kognoz", FACET_VALUES.owner)).toEqual(["darwinbox"]);
  });

  it("selecting the last remaining option means everything, which is no filter", () => {
    const allButFirst = FACET_VALUES.owner.slice(1);
    expect(toggleFacet(allButFirst, FACET_VALUES.owner[0], FACET_VALUES.owner)).toEqual([]);
  });
});

describe("applyWorkspaceFilters", () => {
  it("shows every row, including undrafted ones with no compliance, when nothing is selected", () => {
    expect(applyWorkspaceFilters(rows, NO_FILTERS).map((r) => r.refNo)).toEqual(["R-001", "R-002", "R-003"]);
  });

  it("treats a null status as undrafted", () => {
    expect(applyWorkspaceFilters(rows, { ...NO_FILTERS, status: ["undrafted"] }).map((r) => r.refNo)).toEqual(["R-001"]);
  });

  it("a compliance selection hides rows with no compliance yet", () => {
    expect(applyWorkspaceFilters(rows, { ...NO_FILTERS, compliance: ["fully", "partial"] }).map((r) => r.refNo)).toEqual(["R-002", "R-003"]);
  });

  it("search is trimmed and matches the ref, the answer and the client's own columns", () => {
    expect(applyWorkspaceFilters(rows, { ...NO_FILTERS, q: "  natively " }).map((r) => r.refNo)).toEqual(["R-002"]);
    expect(applyWorkspaceFilters(rows, { ...NO_FILTERS, q: "must" }).map((r) => r.refNo)).toEqual(["R-003"]);
    expect(applyWorkspaceFilters(rows, { ...NO_FILTERS, q: "r-001" }).map((r) => r.refNo)).toEqual(["R-001"]);
  });

  it("section 'none' means unsectioned; a section id means that section", () => {
    expect(applyWorkspaceFilters(rows, { ...NO_FILTERS, section: "none" }).map((r) => r.refNo)).toEqual(["R-001"]);
    expect(applyWorkspaceFilters(rows, { ...NO_FILTERS, section: "s1" }).map((r) => r.refNo)).toEqual(["R-002", "R-003"]);
  });
});

describe("activeFilterGroups", () => {
  it("counts filter groups, not values, and ignores a blank search", () => {
    expect(activeFilterGroups({ ...NO_FILTERS, status: ["approved", "flagged"], compliance: ["fully"], q: "   " })).toBe(2);
    expect(activeFilterGroups(NO_FILTERS)).toBe(0);
    expect(activeFilterGroups({ ...NO_FILTERS, section: "none", q: "x" })).toBe(2);
  });
});

describe("facetCounts", () => {
  it("counts what each value would show under the other groups, ignoring the facet's own selection", () => {
    const compliance = facetCounts(rows, { ...NO_FILTERS, status: ["approved"], compliance: ["fully"] }, "compliance");
    expect(compliance.partial).toBe(1);
    expect(compliance.fully).toBe(0);
    const status = facetCounts(rows, { ...NO_FILTERS, status: ["approved"] }, "status");
    expect(status).toMatchObject({ undrafted: 1, ai_draft: 1, approved: 1, edited: 0, flagged: 0 });
  });
});
