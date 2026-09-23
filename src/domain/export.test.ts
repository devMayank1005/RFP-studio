import { describe, expect, it } from "vitest";

import {
  answerBlocks,
  argb,
  brandHex,
  buildExportModel,
  clientColumnOrder,
  columnWidth,
  complianceCounts,
  contentDisposition,
  docxFont,
  docxOutline,
  EXPORT_FORMAT_META,
  exportFileName,
  exportReadiness,
  fillCellValues,
  fillColumnPlan,
  KOGNOZ_COLUMNS,
  matchQuestionsToRows,
  normaliseExportOptions,
  OTHER_SECTION_TITLE,
  xlsxColumnPlan,
  xlsxRowValues,
  xlsxSummaryRows,
  type ExportSheet,
  type ExportSource,
  type ExportSourceQuestion,
} from "./export";
import { formatDate } from "./dates";

/**
 * Exports: the pure half of turning an RFP's questions, answers and sources
 * into an Excel workbook (fresh, or filled into the client's own sheet) and a
 * Word document. Byte generation lives in src/lib/export; this decides what
 * goes where.
 */

const q = (over: Partial<ExportSourceQuestion> & { id: string }): ExportSourceQuestion => ({
  refNo: over.id.toUpperCase(),
  questionText: `Question ${over.id}`,
  acceptanceCriteria: null,
  questionType: "descriptive",
  isMandatory: false,
  owner: "joint",
  moduleHint: "core_hr",
  rawMeta: {},
  sortOrder: 0,
  sectionId: "s1",
  sourceDocumentId: null,
  sourceRow: null,
  status: "approved",
  compliance: "fully",
  flagReason: null,
  answerText: `Answer ${over.id}`,
  openPoints: [],
  revisionId: `rev-${over.id}`,
  ...over,
});

function source(over: Partial<ExportSource> = {}): ExportSource {
  return {
    rfp: { id: "rfp-1", title: "Apex — HRMS implementation RFP", engagementType: "hris_implementation", bidderOfRecord: "joint", status: "in_review", dueDate: "2026-10-09", contextSummary: "Apex runs SAP today." },
    client: { name: "Apex Manufacturing", industry: "Manufacturing", hqCountry: "India", headcount: 12000, currentHrms: "SAP" },
    sections: [
      { id: "s1", title: "Core HR", sortOrder: 0 },
      { id: "s2", title: "Payroll", sortOrder: 1 },
    ],
    questions: [
      q({ id: "a1", sortOrder: 0, rawMeta: { Priority: "High", "Response required": "Yes" } }),
      q({ id: "a2", sortOrder: 1, status: "ai_draft", compliance: "partial", openPoints: ["Confirm SSO vendor"], rawMeta: { Priority: "Medium" } }),
      q({ id: "b1", sortOrder: 2, sectionId: "s2", status: "flagged", compliance: "not_supported", flagReason: "Needs partner input" }),
      q({ id: "x1", sortOrder: 3, sectionId: null, status: null, compliance: null, answerText: null, revisionId: null }),
    ],
    citations: [
      { revisionId: "rev-a1", ordinal: 1, sourceType: "kb_entry", title: "Biometric integration", excerpt: "…" },
      { revisionId: "rev-a1", ordinal: 2, sourceType: "approved_answer", title: null, excerpt: "…" },
    ],
    chro: [
      { id: "c1", theme: "governance_culture", questionText: "Who owns HR data governance?", rationale: "Gap in D.3", sortOrder: 501, status: "kept", createdAt: "2026-09-16T00:00:00Z" },
      { id: "c2", theme: "mandate_vision", questionText: "What does success look like in 18 months?", rationale: "Brief", sortOrder: 1, status: "kept", createdAt: "2026-09-16T00:00:00Z" },
      { id: "c3", theme: "tech_ai", questionText: "Dropped one", rationale: "—", sortOrder: 301, status: "dropped", createdAt: "2026-09-16T00:00:00Z" },
    ],
    sheets: [],
    generatedAt: "2026-09-16T09:30:00.000Z",
    ...over,
  };
}

describe("EXPORT_FORMAT_META and options", () => {
  it("ships Excel and Word now and keeps the deck for later", () => {
    expect(EXPORT_FORMAT_META.xlsx.available).toBe(true);
    expect(EXPORT_FORMAT_META.docx.available).toBe(true);
    expect(EXPORT_FORMAT_META.pptx.available).toBe(false);
    expect(EXPORT_FORMAT_META.docx.needsEngine).toBe(true);
    expect(EXPORT_FORMAT_META.xlsx.contentType).toContain("spreadsheetml");
  });

  it("normalises options with safe defaults", () => {
    expect(normaliseExportOptions(undefined)).toEqual({ approvedOnly: false, shape: "fresh" });
    expect(normaliseExportOptions({ approvedOnly: true, shape: "fill" })).toEqual({ approvedOnly: true, shape: "fill" });
    expect(normaliseExportOptions({ shape: "bogus" as never })).toEqual({ approvedOnly: false, shape: "fresh" });
  });
});

describe("clientColumnOrder", () => {
  const headers = ["S.No", "Module", "Requirement", "Priority", "Vendor Response", "Remarks"];

  it("uses the client's own header order, including columns nobody filled", () => {
    const order = clientColumnOrder([headers], [{ "S.No": "1", Module: "Core", Requirement: "SSO", Priority: "High" }]);
    expect(order).toEqual(headers);
  });

  it("falls back to first appearance of raw_meta keys when no sheet is known", () => {
    expect(clientColumnOrder([], [{ Priority: "High", "Response required": "Yes" }, { Priority: "Low", Note: "x" }])).toEqual(["Priority", "Response required", "Note"]);
  });

  it("skips sheets that produced no question", () => {
    const unused = ["Instructions", "Contact"];
    expect(clientColumnOrder([headers, unused], [{ Requirement: "SSO", Priority: "High" }])).toEqual(headers);
  });

  it("puts narrative page/ref columns after the sheet columns", () => {
    const order = clientColumnOrder([headers], [{ Requirement: "SSO" }, { Page: "3", Ref: "P3.2" }]);
    expect(order).toEqual([...headers, "Page", "Ref"]);
  });
});

describe("buildExportModel", () => {
  it("groups questions by section in order and parks unsectioned ones last", () => {
    const model = buildExportModel(source());
    expect(model.sections.map((s) => s.title)).toEqual(["Core HR", "Payroll", OTHER_SECTION_TITLE]);
    expect(model.sections[0].questions.map((x) => x.refNo)).toEqual(["A1", "A2"]);
    expect(model.questions.map((x) => x.refNo)).toEqual(["A1", "A2", "B1", "X1"]);
    expect(model.questions[3].answer).toBeNull();
    expect(model.questions[3].sectionTitle).toBe(OTHER_SECTION_TITLE);
  });

  it("exports answer text without inline citation markers, whatever an older draft left in it", () => {
    const src = source();
    src.questions = src.questions.map((x) => (x.id === "a1" ? { ...x, answerText: "Fully compliant [1]. Bank files [2] follow [brief]." } : x));
    const model = buildExportModel(src);
    expect(model.questions[0].answer?.text).toBe("Fully compliant. Bank files follow.");
  });

  it("resolves citation titles with a fallback per source type", () => {
    const model = buildExportModel(source());
    expect(model.questions[0].answer?.sources).toEqual([
      { ordinal: 1, title: "Biometric integration", sourceType: "kb_entry" },
      { ordinal: 2, title: "Approved answer", sourceType: "approved_answer" },
    ]);
  });

  it("keeps only kept CHRO questions, in theme order", () => {
    const model = buildExportModel(source());
    expect(model.chro.map((c) => c.theme)).toEqual(["mandate_vision", "governance_culture"]);
  });

  it("counts readiness and compliance", () => {
    const model = buildExportModel(source());
    expect(model.readiness).toEqual({ total: 4, drafted: 3, approved: 1, unapproved: 3, flagged: 1, notDrafted: 1 });
    expect(model.complianceCounts.fully).toBe(1);
    expect(model.complianceCounts.partial).toBe(1);
    expect(model.complianceCounts.not_supported).toBe(1);
    expect(model.generatedOn).toBe(formatDate("2026-09-16"));
  });

  it("blanks unapproved answers when approvedOnly is set but keeps their status", () => {
    const model = buildExportModel(source(), { approvedOnly: true });
    const a2 = model.questions[1].answer!;
    expect(a2.status).toBe("ai_draft");
    expect(a2.text).toBe("");
    expect(a2.openPoints).toEqual([]);
    expect(model.questions[0].answer?.text).toBe("Answer a1");
  });
});

describe("fresh workbook plan", () => {
  it("lists client columns first, then the Kognoz columns", () => {
    const plan = xlsxColumnPlan(buildExportModel(source()));
    expect(plan.slice(0, 2).map((c) => [c.kind, c.header])).toEqual([
      ["client", "Priority"],
      ["client", "Response required"],
    ]);
    expect(plan.slice(2).map((c) => c.header)).toEqual(KOGNOZ_COLUMNS.map((c) => c.header));
    expect(plan.find((c) => c.field === "response")?.width).toBe(70);
    expect(new Set(plan.map((c) => c.key)).size).toBe(plan.length);
  });

  it("prefixes our column when the client already uses the header", () => {
    const src = source({ questions: [q({ id: "a1", rawMeta: { Requirement: "SSO", Response: "", Status: "Open" } })] });
    const plan = xlsxColumnPlan(buildExportModel(src));
    expect(plan.map((c) => c.header)).toContain("Kognoz Response");
    expect(plan.map((c) => c.header)).toContain("Kognoz Status");
    expect(plan.filter((c) => c.header === "Response")).toHaveLength(1);
  });

  it("fills a row from raw_meta and the answer", () => {
    const model = buildExportModel(source());
    const plan = xlsxColumnPlan(model);
    const row = xlsxRowValues(model.questions[0], plan);
    expect(row[plan[0].key]).toBe("High");
    expect(row["k:ref"]).toBe("A1");
    expect(row["k:section"]).toBe("Core HR");
    expect(row["k:compliance"]).toBe("Fully");
    expect(row["k:response"]).toBe("Answer a1");
    expect(row["k:status"]).toBe("Approved");
    expect(row["k:owner"]).toBe("Joint");
    expect(row["k:sources"]).toBe("[1] Biometric integration; [2] Approved answer");
    const a2 = xlsxRowValues(model.questions[1], plan);
    expect(a2["k:openPoints"]).toBe("• Confirm SSO vendor");
    const x1 = xlsxRowValues(model.questions[3], plan);
    expect(x1["k:status"]).toBe("Not drafted");
    expect(x1["k:response"]).toBe("");
  });

  it("sizes client columns from their content within bounds", () => {
    expect(columnWidth("Priority", ["High", "Low"])).toBe(12);
    expect(columnWidth("Requirement", Array(20).fill("x".repeat(300)))).toBe(60);
    expect(columnWidth("Module", Array(10).fill("Talent acquisition"))).toBeGreaterThan(12);
  });

  it("writes a summary sheet that adds up", () => {
    const rows = xlsxSummaryRows(buildExportModel(source()), "Kognoz · Confidential");
    const get = (k: string) => rows.find(([key]) => key === k)?.[1];
    expect(get("RFP")).toBe("Apex — HRMS implementation RFP");
    expect(get("Client")).toBe("Apex Manufacturing");
    expect(get("Questions")).toBe("4");
    expect(get("Approved")).toBe("1");
    expect(get("Not drafted")).toBe("1");
    expect(get("Fully")).toBe("1");
    expect(rows.at(-1)?.[1]).toBe("Kognoz · Confidential");
  });
});

describe("filling the client's workbook", () => {
  const sheet: ExportSheet = {
    documentId: "doc-1",
    name: "Functional",
    headerRow: 1,
    headers: ["Sr No", "Explicit Requirement", "Acceptance Criteria / Minimum Expected Outcome", "Priority", "Solution", "Feasibility", "Other Remarks"],
    rows: [
      { row: 2, cells: { "Sr No": "1", "Explicit Requirement": "Single sign-on with Azure AD for all employees", Priority: "High" } },
      { row: 3, cells: { "Sr No": "2", "Explicit Requirement": "Biometric attendance capture at 40 plants and payroll sync", Priority: "High" } },
      { row: 4, cells: { "Sr No": "3", "Explicit Requirement": "Something else entirely", Priority: "Low" } },
    ],
  };
  const other: ExportSheet = { documentId: "doc-1", name: "Instructions", headerRow: 1, headers: ["Step", "Text"], rows: [{ row: 2, cells: { Step: "1", Text: "Read carefully" } }] };

  it("finds the client's response columns by role", () => {
    const plan = fillColumnPlan(sheet.headers);
    expect(plan).toEqual({ answer: "Solution", compliance: "Feasibility", remarks: "Other Remarks", questions: null, append: [] });
    expect(fillColumnPlan([...sheet.headers, "Questions"]).questions).toBe("Questions");
  });

  it("appends Kognoz columns when the client left no room", () => {
    const plan = fillColumnPlan(["Requirement", "Priority"]);
    expect(plan.answer).toBeNull();
    expect(plan.append.map((a) => a.header)).toEqual(["Kognoz response", "Kognoz compliance", "Kognoz remarks"]);
  });

  it("matches a question to its row by text, ignoring sheets that only share the row number", () => {
    const model = buildExportModel(
      source({
        sheets: [other, sheet],
        questions: [q({ id: "a1", questionText: "Single sign-on with Azure AD for all employees", sourceDocumentId: "doc-1", sourceRow: 2 })],
      }),
    );
    const result = matchQuestionsToRows(model.questions, model.sheets);
    expect(result.matches["a1"]).toEqual({ sheetName: "Functional", row: 2 });
    expect(result.unmatched).toEqual([]);
  });

  it("lets split questions share a row and reports merged or unknown ones", () => {
    const model = buildExportModel(
      source({
        sheets: [sheet],
        questions: [
          q({ id: "s1a", questionText: "Biometric attendance capture at 40 plants", sourceDocumentId: "doc-1", sourceRow: 3, sortOrder: 0 }),
          q({ id: "s1b", questionText: "Payroll sync of biometric attendance", sourceDocumentId: "doc-1", sourceRow: 3, sortOrder: 1, rawMeta: { "Sr No": "2", Priority: "High" } }),
          q({ id: "m1", questionText: "Single sign-on with Azure AD for all employees. Something else entirely", sourceDocumentId: "doc-1", sourceRow: 2, sortOrder: 2 }),
          q({ id: "n1", questionText: "From a PDF", sourceDocumentId: "doc-2", sourceRow: 7, sortOrder: 3 }),
          q({ id: "z1", questionText: "No idea where from", sourceDocumentId: "doc-1", sourceRow: 99, sortOrder: 4 }),
        ],
      }),
    );
    const result = matchQuestionsToRows(model.questions, model.sheets);
    expect(result.matches["s1a"]).toEqual({ sheetName: "Functional", row: 3 });
    expect(result.matches["s1b"]).toEqual({ sheetName: "Functional", row: 3 });
    expect(result.shared["Functional:3"]).toEqual(["s1a", "s1b"]);
    // The merged question keeps the first row.
    expect(result.matches["m1"]).toEqual({ sheetName: "Functional", row: 2 });
    expect(result.unmatched.map((u) => u.questionId)).toEqual(["n1", "z1"]);
  });

  it("writes shared rows as lettered blocks and remembers which answers are unapproved", () => {
    const model = buildExportModel(source({ questions: [q({ id: "a", sortOrder: 0 }), q({ id: "b", sortOrder: 1, status: "edited", compliance: "partial", openPoints: ["Check scope"] })] }));
    const cell = fillCellValues(model.questions);
    expect(cell.text).toBe("(a) Answer a\n\n(b) Answer b");
    expect(cell.compliance).toBe("(a) Fully; (b) Partial");
    expect(cell.remarks).toBe("(b) Check scope");
    expect(cell.unapproved).toEqual(["Edited"]);
    const single = fillCellValues([model.questions[0]]);
    expect(single).toEqual({ text: "Answer a", compliance: "Fully", remarks: "", questions: "", unapproved: [] });
    // With a questions column of the client's own, open points go there and remarks keep only flags.
    const split = fillCellValues(model.questions, { separateQuestions: true });
    expect(split.questions).toBe("(b) Check scope");
    expect(split.remarks).toBe("");
  });
});

describe("file names and headers", () => {
  it("builds a safe, dated file name", () => {
    const name = exportFileName({ clientName: "Apex Manufacturing (demo)", rfpTitle: "Apex Manufacturing — HRMS implementation RFP (demo)", format: "xlsx", date: "2026-09-16" });
    expect(name).toBe("apex-manufacturing-hrms-implementation-rfp-response-2026-09-16.xlsx");
    expect(name.length).toBeLessThanOrEqual(120);
    // A long title is cut between words, never inside one.
    const long = exportFileName({ clientName: "Vedanta", rfpTitle: "Vedanta — HR transformation requirements and shared services operating model RFP", format: "docx", date: "2026-09-16" });
    expect(long).toBe("vedanta-hr-transformation-requirements-and-shared-services-response-2026-09-16.docx");
  });

  it("names a filled workbook after the client's file", () => {
    expect(exportFileName({ clientName: "Vedanta", rfpTitle: "x", format: "xlsx", date: "2026-09-16", shape: "fill", originalName: "Vedanta HR Transformation.xlsx" })).toBe("vedanta-hr-transformation-kognoz-response-2026-09-16.xlsx");
  });

  it("falls back when nothing survives slugging", () => {
    expect(exportFileName({ clientName: "株式会社", rfpTitle: "採用", format: "docx", date: "2026-09-16" })).toBe("rfp-response-2026-09-16.docx");
  });

  it("encodes non-ASCII names for Content-Disposition", () => {
    const header = contentDisposition("Résumé.docx");
    expect(header).toContain('filename="Resume.docx"');
    expect(header).toContain("filename*=UTF-8''R%C3%A9sum%C3%A9.docx");
  });
});

describe("readiness and counts", () => {
  it("counts the seed shape", () => {
    const rows = [...Array(7).fill({ status: "approved" }), ...Array(3).fill({ status: "edited" }), ...Array(11).fill({ status: "ai_draft" }), { status: "flagged" }, { status: null }, { status: null }];
    expect(exportReadiness(rows)).toEqual({ total: 24, drafted: 22, approved: 7, unapproved: 17, flagged: 1, notDrafted: 2 });
  });

  it("counts compliance levels with zeros present", () => {
    const counts = complianceCounts([{ compliance: "fully" }, { compliance: "fully" }, { compliance: null }]);
    expect(counts.fully).toBe(2);
    expect(counts.na).toBe(0);
  });
});

describe("Word outline", () => {
  it("splits an answer into paragraphs and bullet lists", () => {
    expect(answerBlocks("First para.\n\nSecond para\ncontinues.")).toEqual([
      { kind: "paragraph", text: "First para." },
      { kind: "paragraph", text: "Second para continues." },
    ]);
    expect(answerBlocks("Intro:\n\n- one\n- two\n\n1. three\n2) four")).toEqual([
      { kind: "paragraph", text: "Intro:" },
      { kind: "bullets", items: ["one", "two"] },
      { kind: "bullets", items: ["three", "four"] },
    ]);
    expect(answerBlocks("")).toEqual([]);
  });

  it("lays out cover, summary, overview, sections, questions and the CHRO appendix", () => {
    const model = buildExportModel(source());
    const nodes = docxOutline(model, { paragraphs: ["We propose…"], highlights: ["Live in 9 months"] });
    expect(nodes[0]).toMatchObject({ kind: "cover", title: "Apex — HRMS implementation RFP", client: "Apex Manufacturing" });
    expect(nodes.filter((n) => n.kind === "heading" && n.level === 1).map((n) => (n as { text: string }).text)).toEqual(["Executive summary", "Response overview", "Core HR", "Payroll", OTHER_SECTION_TITLE, "Appendix: questions for the CHRO conversation"]);
    expect(nodes.filter((n) => n.kind === "question")).toHaveLength(4);
    const first = nodes.find((n) => n.kind === "question") as Extract<ReturnType<typeof docxOutline>[number], { kind: "question" }>;
    expect(first.meta).toBe("Fully · Approved · Joint");
    expect(first.sources).toBe("[1] Biometric integration; [2] Approved answer");
    expect(nodes.filter((n) => n.kind === "chro").map((n) => (n as { theme: string }).theme)).toEqual(["mandate_vision", "governance_culture"]);
  });

  it("says so when there is no summary and drops the appendix without kept questions", () => {
    const model = buildExportModel(source({ chro: [] }));
    const nodes = docxOutline(model, null);
    const i = nodes.findIndex((n) => n.kind === "heading" && (n as { text: string }).text === "Executive summary");
    expect(nodes[i + 1]).toMatchObject({ kind: "paragraph", muted: true });
    expect(nodes.some((n) => n.kind === "chro")).toBe(false);
  });
});

describe("brand colours for office files", () => {
  it("normalises hex without the hash and falls back on garbage", () => {
    expect(brandHex("#005184", "000000")).toBe("005184");
    expect(brandHex("2b9e85", "000000")).toBe("2B9E85");
    expect(brandHex("not a colour", "005184")).toBe("005184");
    expect(argb("#005184", "000000")).toBe("FF005184");
  });

  it("maps the system font to Word's default", () => {
    expect(docxFont("system")).toBe("Calibri");
    expect(docxFont("Inter")).toBe("Inter");
  });
});
