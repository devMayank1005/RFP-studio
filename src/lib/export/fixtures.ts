import { buildExportModel, type ExportBrand, type ExportModel, type ExportOptions, type ExportSheet, type ExportSource, type ExportSourceQuestion } from "@/domain/export";

/**
 * A small but complete RFP for renderer tests: two sections, one client
 * worksheet the questions came from, answers in every status, a citation,
 * open points and a kept CHRO question. Not a test file itself.
 */

export const sampleSheet: ExportSheet = {
  documentId: "doc-1",
  name: "Functional",
  headerRow: 1,
  headers: ["Sr No", "Explicit Requirement", "Acceptance Criteria / Minimum Expected Outcome", "Priority", "Solution", "Feasibility", "Other Remarks"],
  rows: [
    { row: 2, cells: { "Sr No": "1", "Explicit Requirement": "Single sign-on with Azure AD for all employees", "Acceptance Criteria / Minimum Expected Outcome": "Users log in once", Priority: "High" } },
    { row: 3, cells: { "Sr No": "2", "Explicit Requirement": "Biometric attendance capture at 40 plants and payroll sync", Priority: "High" } },
    { row: 4, cells: { "Sr No": "3", "Explicit Requirement": "Payslip self-service on mobile", Priority: "Medium" } },
    { row: 5, cells: { "Sr No": "4", "Explicit Requirement": "Something the extractor skipped", Priority: "Low" } },
  ],
};

const question = (over: Partial<ExportSourceQuestion> & { id: string; questionText: string }): ExportSourceQuestion => ({
  refNo: over.id.toUpperCase(),
  acceptanceCriteria: null,
  questionType: "descriptive",
  isMandatory: false,
  owner: "joint",
  moduleHint: "core_hr",
  rawMeta: {},
  sortOrder: 0,
  sectionId: "s1",
  sourceDocumentId: "doc-1",
  sourceRow: null,
  status: "approved",
  compliance: "fully",
  flagReason: null,
  answerText: null,
  openPoints: [],
  revisionId: `rev-${over.id}`,
  ...over,
});

export function sampleSource(): ExportSource {
  return {
    rfp: { id: "rfp-1", title: "Apex Manufacturing — HRMS implementation RFP", engagementType: "hris_implementation", bidderOfRecord: "joint", status: "in_review", dueDate: "2026-10-09", contextSummary: "Apex runs SAP today and wants one HR platform across 40 plants." },
    client: { name: "Apex Manufacturing", industry: "Manufacturing", hqCountry: "India", headcount: 12000, currentHrms: "SAP" },
    sections: [
      { id: "s1", title: "Core HR & organisation", sortOrder: 0 },
      { id: "s2", title: "Time, attendance & payroll", sortOrder: 1 },
    ],
    questions: [
      question({
        id: "a1",
        questionText: "Single sign-on with Azure AD for all employees",
        acceptanceCriteria: "Users log in once",
        isMandatory: true,
        owner: "darwinbox",
        rawMeta: { "Sr No": "1", "Explicit Requirement": "Single sign-on with Azure AD for all employees", "Acceptance Criteria / Minimum Expected Outcome": "Users log in once", Priority: "High" },
        sortOrder: 0,
        sourceRow: 2,
        answerText: "Fully compliant. Darwinbox supports SAML 2.0 single sign-on with Azure AD as standard [1].\n\nUsers authenticate once and reach every module, including the mobile app.",
      }),
      question({
        id: "b1",
        questionText: "Biometric attendance capture at 40 plants and payroll sync",
        rawMeta: { "Sr No": "2", "Explicit Requirement": "Biometric attendance capture at 40 plants and payroll sync", Priority: "High" },
        sortOrder: 1,
        sectionId: "s2",
        sourceRow: 3,
        status: "edited",
        compliance: "partial",
        answerText: "Partially compliant. Attendance flows in through the standard biometric API.\n\n- Devices post punches over HTTPS\n- Payroll picks up the approved attendance cycle",
        openPoints: ["Confirm the device vendor at the Pune plant"],
      }),
      question({
        id: "b2",
        questionText: "Payslip self-service on mobile",
        rawMeta: { "Sr No": "3", "Explicit Requirement": "Payslip self-service on mobile", Priority: "Medium" },
        sortOrder: 2,
        sectionId: "s2",
        sourceRow: 4,
        status: null,
        compliance: null,
        revisionId: null,
      }),
      question({
        id: "x1",
        questionText: "Describe your approach to change management",
        rawMeta: { Page: "12", Ref: "P12.1" },
        sortOrder: 3,
        sectionId: null,
        sourceDocumentId: "doc-2",
        sourceRow: 12,
        status: "flagged",
        compliance: "via_partner",
        flagReason: "Needs the Kognoz change lead's input",
        answerText: "Kognoz runs a structured adoption programme.",
      }),
    ],
    citations: [{ revisionId: "rev-a1", ordinal: 1, sourceType: "kb_entry", title: "SSO and identity", excerpt: "SAML 2.0…" }],
    chro: [
      { id: "c1", theme: "mandate_vision", questionText: "What does success look like in 18 months?", rationale: "From the brief", sortOrder: 1, status: "kept", createdAt: "2026-09-16T00:00:00Z" },
      { id: "c2", theme: "governance_culture", questionText: "Who owns HR data governance across the plants?", rationale: "B.1 was partial", sortOrder: 501, status: "kept", createdAt: "2026-09-16T00:00:00Z" },
      { id: "c3", theme: "tech_ai", questionText: "Dropped", rationale: "—", sortOrder: 301, status: "dropped", createdAt: "2026-09-16T00:00:00Z" },
    ],
    sheets: [sampleSheet],
    generatedAt: "2026-09-16T09:30:00.000Z",
  };
}

export function sampleModel(options?: ExportOptions): ExportModel {
  return buildExportModel(sampleSource(), options);
}

export const sampleBrand: ExportBrand = {
  name: "Kognoz Consulting",
  primaryColor: "#005184",
  accentColor: "#2B9E85",
  successColor: "#71A247",
  fontFamily: "Inter",
  footerText: "Kognoz Consulting & Research Pvt. Ltd. · Confidential",
  logoUrl: "/brand/kognoz-logo.png",
};
