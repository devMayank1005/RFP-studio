import { describe, expect, it } from "vitest";

import {
  assembleSheetQuestions,
  chunk,
  chunkPages,
  columnMapFromRoles,
  generateRefNo,
  guessColumnRoles,
  mapExistingCompliance,
  mapPriority,
  normaliseSectionTitle,
  sheetCandidates,
  sheetExtractionSchema,
  narrativeExtractionSchema,
  type SheetRowLike,
} from "./extraction";

describe("guessColumnRoles", () => {
  it("recognises the Vedanta headers without a model", () => {
    const roles = guessColumnRoles([
      "Explicit Requirement",
      "Acceptance Criteria / Minimum Expected Outcome",
      "Priority",
      "Feasibility",
      "Solution",
      "Questions",
      "Other Remarks",
    ]);
    expect(roles).toEqual({
      "Explicit Requirement": "question",
      "Acceptance Criteria / Minimum Expected Outcome": "acceptance_criteria",
      Priority: "priority",
      Feasibility: "existing_compliance",
      Solution: "existing_answer",
      Questions: "existing_questions",
      "Other Remarks": "remarks",
    });
  });

  it("recognises the synthetic fixture headers", () => {
    const roles = guessColumnRoles(["S.No", "Module", "Requirement", "Priority (M/S/C)", "Vendor Response (Y/P/N)", "Remarks"]);
    expect(roles).toEqual({
      "S.No": "ref_no",
      Module: "section",
      Requirement: "question",
      "Priority (M/S/C)": "priority",
      "Vendor Response (Y/P/N)": "existing_compliance",
      Remarks: "remarks",
    });
  });

  it("marks headers it cannot place as unknown, so the model is asked", () => {
    expect(guessColumnRoles(["Zeta", "Requirement"])).toEqual({ Zeta: "unknown", Requirement: "question" });
  });

  it("never assigns the question role twice", () => {
    const roles = guessColumnRoles(["Requirement", "Requirement description", "Question"]);
    expect(Object.values(roles).filter((r) => r === "question")).toHaveLength(1);
  });
});

describe("columnMapFromRoles", () => {
  it("indexes columns by role and reports whether a question column exists", () => {
    const map = columnMapFromRoles({ A: "ref_no", B: "question", C: "other", D: "remarks" });
    expect(map.question).toBe("B");
    expect(map.refNo).toBe("A");
    expect(map.passthrough).toEqual(["C", "D"]);
    expect(map.hasQuestion).toBe(true);
  });
});

describe("mapPriority", () => {
  it("treats must-have wording as mandatory and everything else as not", () => {
    for (const v of ["Must Have", "M", "Mandatory", "High", "Critical", "Essential", "must"]) expect(mapPriority(v)).toBe(true);
    for (const v of ["Should Have", "S", "Could", "C", "Nice to have", "Optional", "Low", "Dependency", "", undefined]) expect(mapPriority(v)).toBe(false);
  });
});

describe("mapExistingCompliance", () => {
  it("maps the vocabulary clients and vendors actually use", () => {
    expect(mapExistingCompliance("Yes")).toBe("fully");
    expect(mapExistingCompliance("yes")).toBe("fully");
    expect(mapExistingCompliance("Y")).toBe("fully");
    expect(mapExistingCompliance("Fully compliant")).toBe("fully");
    expect(mapExistingCompliance("Partial Yes")).toBe("partial");
    expect(mapExistingCompliance("P")).toBe("partial");
    expect(mapExistingCompliance("Via customisation")).toBe("via_customization");
    expect(mapExistingCompliance("Through partner")).toBe("via_partner");
    expect(mapExistingCompliance("No")).toBe("not_supported");
    expect(mapExistingCompliance("Not supported")).toBe("not_supported");
    expect(mapExistingCompliance("NA")).toBe("na");
    expect(mapExistingCompliance("N/A")).toBe("na");
  });

  it("returns null for undecided or empty values", () => {
    expect(mapExistingCompliance("TBD")).toBeNull();
    expect(mapExistingCompliance("")).toBeNull();
    expect(mapExistingCompliance(undefined)).toBeNull();
    expect(mapExistingCompliance("Will need to understand the use case")).toBeNull();
  });
});

describe("generateRefNo", () => {
  it("pads to three digits and grows past 999", () => {
    expect(generateRefNo(0)).toBe("R-001");
    expect(generateRefNo(41)).toBe("R-042");
    expect(generateRefNo(1204)).toBe("R-1205");
  });

  it("keeps a client's own reference when present", () => {
    expect(generateRefNo(3, "4.2.1")).toBe("4.2.1");
    expect(generateRefNo(3, "  ")).toBe("R-004");
  });
});

describe("chunk / chunkPages", () => {
  it("splits rows into fixed-size chunks", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });

  it("groups pages up to a character budget without splitting a page", () => {
    const pages = [
      { page: 1, text: "a".repeat(3000) },
      { page: 2, text: "b".repeat(3000) },
      { page: 3, text: "c".repeat(1000) },
    ];
    expect(chunkPages(pages, 6500).map((c) => c.map((p) => p.page))).toEqual([[1, 2], [3]]);
  });
});

describe("normaliseSectionTitle", () => {
  it("trims, collapses whitespace and strips trailing punctuation", () => {
    expect(normaliseSectionTitle("  Core   HR : ")).toBe("Core HR");
    expect(normaliseSectionTitle("")).toBe("General");
  });
});

describe("output schemas", () => {
  it("accepts a well-formed sheet extraction and rejects a bad enum", () => {
    const ok = sheetExtractionSchema.safeParse({
      rows: [{ source_row: 4, is_question: true, section_title: "Core HR", question_type: "compliance", module_hint: "core_hr", owner_guess: "darwinbox" }],
    });
    expect(ok.success).toBe(true);
    const bad = sheetExtractionSchema.safeParse({ rows: [{ source_row: 4, is_question: true, section_title: "x", question_type: "essay", module_hint: "core_hr", owner_guess: "darwinbox" }] });
    expect(bad.success).toBe(false);
  });

  it("accepts a narrative extraction", () => {
    const ok = narrativeExtractionSchema.safeParse({
      questions: [
        { source_page: 2, section_title: "Questions to bidders", ref_no: "Q1", question_text: "Describe…", question_type: "descriptive", is_mandatory: true, module_hint: "implementation", owner_guess: "joint" },
      ],
    });
    expect(ok.success).toBe(true);
  });
});

describe("sheetCandidates", () => {
  it("keeps only rows with something in the question cell, with their original row numbers", () => {
    const rows: SheetRowLike[] = [
      { row: 4, cells: { Requirement: "Leave accrual rules", Priority: "Must" } },
      { row: 5, cells: { Priority: "Must" } },
      { row: 6, cells: { Requirement: "   " } },
      { row: 9, cells: { Requirement: "Payroll runs", Priority: "Should" } },
    ];
    expect(sheetCandidates({ rows }, "Requirement").map((r) => r.row)).toEqual([4, 9]);
  });
});

describe("assembleSheetQuestions", () => {
  const map = { ...columnMapFromRoles(guessColumnRoles(["Requirement", "Section", "Priority"])), hasQuestion: true };
  const candidates: SheetRowLike[] = [
    { row: 4, cells: { Requirement: "Leave accrual rules", Section: "Leave", Priority: "Must" } },
    { row: 5, cells: { Requirement: "Ignore this heading row", Section: "Leave" } },
    { row: 9, cells: { Requirement: "Payroll runs", Section: "Payroll", Priority: "Should" } },
  ];
  const modelRows = [
    { source_row: 4, is_question: true, section_title: "Leave management", question_type: "descriptive", module_hint: "leave", owner_guess: "darwinbox" },
    // Same section, different case: must not become a second section.
    { source_row: 5, is_question: false, section_title: "leave management", question_type: "descriptive", module_hint: "leave", owner_guess: "not_applicable" },
  ] as const;

  it("numbers generated refs from startIndex so chunks and documents never collide", () => {
    const { questions } = assembleSheetQuestions({ candidates, modelRows: [...modelRows], map, knownSections: [], startIndex: 40 });
    expect(questions.map((q) => q.refNo)).toEqual(["R-041", "R-042"]);
  });

  it("skips rows the model says are not questions, without consuming a ref", () => {
    const { questions } = assembleSheetQuestions({ candidates, modelRows: [...modelRows], map, knownSections: [], startIndex: 0 });
    expect(questions.map((q) => q.sourceRow)).toEqual([4, 9]);
    expect(questions[0]).toMatchObject({ refNo: "R-001", sectionTitle: "Leave management", questionType: "descriptive", moduleHint: "leave", owner: "darwinbox", isMandatory: true });
  });

  it("defaults a row the model did not return instead of dropping it", () => {
    const { questions } = assembleSheetQuestions({ candidates, modelRows: [...modelRows], map, knownSections: [], startIndex: 0 });
    expect(questions[1]).toMatchObject({ sourceRow: 9, sectionTitle: "Payroll", questionType: "descriptive", owner: "joint", moduleHint: "general", isMandatory: false });
  });

  it("keeps the client's own ref verbatim and appends new sections after the known ones", () => {
    const withRef = { ...map, refNo: "Ref" };
    const rows = candidates.map((c) => ({ ...c, cells: { ...c.cells, Ref: `T-${c.row}` } }));
    const { questions, sections } = assembleSheetQuestions({ candidates: rows, modelRows: [...modelRows], map: withRef, knownSections: ["General"], startIndex: 10 });
    expect(questions.map((q) => q.refNo)).toEqual(["T-4", "T-9"]);
    expect(sections).toEqual(["General", "Leave management"]);
  });
});
