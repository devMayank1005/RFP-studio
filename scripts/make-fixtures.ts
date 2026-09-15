/**
 * Generates the synthetic, committable RFP fixtures under fixtures/public:
 *
 *   hrms-rfp.xlsx        a requirements workbook with a title row above the
 *                        headers, blank rows, multi-line cells, a date column,
 *                        an instructions sheet and a commercials sheet
 *   rfp-narrative.pdf    a three-page narrative RFP with numbered questions
 *   client-pointers.docx a "pointers" document (demerger context)
 *
 * Real client RFPs go in fixtures/private (git-ignored). Re-run with
 * `pnpm exec tsx scripts/make-fixtures.ts` after changing anything here.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const OUT = path.join(process.cwd(), "fixtures", "public");

const REQUIREMENTS: Array<[string, string, string]> = [
  ["Core HR", "Maintain a single employee master for both legal entities with entity-specific custom fields.", "M"],
  ["Core HR", "Effective-dated history of every employee field change with an audit trail.", "M"],
  ["Core HR", "Position management with headcount budgets and vacancy tracking per business unit.", "M"],
  ["Core HR", "Configurable multi-level approval workflows by entity, grade and amount.", "M"],
  ["Core HR", "Generate HR letters from templates with digital signature.", "S"],
  ["Payroll", "Process Indian payroll for both entities on separate calendars with PF, ESI, PT, LWF and TDS.", "M"],
  ["Payroll", "Generate Form 16 and quarterly TDS returns per entity.", "M"],
  ["Payroll", "Digital maker–checker workflow for one-off payments:\n- joining bonus\n- retention bonus\n- recoveries", "M"],
  ["Payroll", "Full and final settlement triggered from the separation workflow.", "M"],
  ["Payroll", "Bank advice file in the format of each entity's bank.", "S"],
  ["Time & Attendance", "Capture attendance from existing biometric devices at plants.", "M"],
  ["Time & Attendance", "Geo-fenced mobile check-in for field staff with offline sync.", "M"],
  ["Time & Attendance", "Shift rosters with plant-specific overtime rules for unionised workmen.", "M"],
  ["Time & Attendance", "LOP and actual-working-day reports by date range, employee and department.", "M"],
  ["Leave", "Entity- and location-specific leave policies with comp-off.", "M"],
  ["Leave", "Effective-dated leave balance report.", "M"],
  ["Leave", "Holiday calendars by location.", "S"],
  ["Recruitment", "Requisitions raised against positions with approval workflow.", "M"],
  ["Recruitment", "Post jobs to Naukri and LinkedIn from the system.", "S"],
  ["Recruitment", "Offer letters generated from approved salary structures.", "M"],
  ["Recruitment", "Background verification integration with our BGV vendor.", "S"],
  ["Performance", "Goal setting with cascaded goals and mid-year and annual reviews.", "M"],
  ["Performance", "Probation confirmation workflow driven by actual completion date.", "M"],
  ["Performance", "Calibration and rating normalisation.", "S"],
  ["Learning", "Mandatory-training assignment by role with certification expiry.", "S"],
  ["Learning", "SCORM content support.", "C"],
  ["Compensation", "Standardised salary structures and CTC components across entities.", "M"],
  ["Compensation", "Annual increment cycle with budget control and guideline matrix.", "M"],
  ["Compensation", "Compensation cost analytics: total, fixed, variable, benefits.", "S"],
  ["Compensation", "Automated bonus calculation with integration to Hyperion.", "S"],
  ["Core HR", "Policy repository with acknowledgement tracking.", "S"],
  ["Core HR", "HR helpdesk with SLAs.", "S"],
  ["Payroll", "Reimbursement claims with policy limits.", "S"],
  ["Time & Attendance", "Regularisation requests with manager approval.", "M"],
  ["Recruitment", "Career page integration.", "C"],
  ["Performance", "360-degree feedback.", "C"],
  ["Learning", "Classroom session management.", "C"],
  ["Compensation", "Long-term incentive plan tracking.", "C"],
  ["Core HR", "Employee self-service on mobile for profile, documents and requests.", "M"],
  ["Core HR", "Single sign-on with Microsoft Entra ID.", "M"],
];

async function makeXlsx() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RFP Studio fixtures";

  const req = wb.addWorksheet("Requirements");
  req.mergeCells("A1:F1");
  req.getCell("A1").value = "Apex Manufacturing — HRMS Requirements (synthetic fixture)";
  req.getCell("A1").font = { bold: true, size: 14 };
  // Row 2 intentionally blank; headers on row 3.
  req.getRow(3).values = ["S.No", "Module", "Requirement", "Priority (M/S/C)", "Vendor Response (Y/P/N)", "Remarks"];
  req.getRow(3).font = { bold: true };
  let rowNo = 4;
  REQUIREMENTS.forEach(([module, text, priority], i) => {
    // A blank spacer row between modules, to prove blank rows are skipped.
    if (i > 0 && REQUIREMENTS[i - 1][0] !== module) rowNo++;
    req.getRow(rowNo).values = [i + 1, module, text, priority, "", ""];
    rowNo++;
  });
  req.columns = [{ width: 6 }, { width: 18 }, { width: 70 }, { width: 14 }, { width: 22 }, { width: 30 }];

  const instructions = wb.addWorksheet("Instructions");
  instructions.getCell("A1").value = "Instructions to bidders";
  instructions.getCell("A2").value = "Respond to each requirement with Y (standard), P (partial / customisation) or N (not supported).";
  instructions.getCell("A3").value = "Attach product documentation for any P response.";

  const comm = wb.addWorksheet("Commercials");
  comm.getRow(1).values = ["Item", "Description", "Unit", "Qty", "Unit price (INR)", "Needed by"];
  comm.getRow(2).values = ["Licences", "Per employee per month", "PEPM", 8200, 0, new Date(Date.UTC(2026, 11, 31))];
  comm.getRow(3).values = ["Implementation", "One-time, all modules", "Lump sum", 1, 0, new Date(Date.UTC(2027, 2, 31))];
  comm.getRow(4).values = ["Change management", "Kognoz workstream", "Lump sum", 1, 0, null];

  await wb.xlsx.writeFile(path.join(OUT, "hrms-rfp.xlsx"));
  return REQUIREMENTS.length;
}

function wrap(text: string, max = 92): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      if ((line + " " + word).trim().length > max) {
        out.push(line.trim());
        line = word;
      } else line = `${line} ${word}`;
    }
    out.push(line.trim());
  }
  return out;
}

const PDF_PAGES = [
  `Request for Proposal: Human Resource Management System
Apex Manufacturing Limited (synthetic fixture)

1. Introduction
Apex Manufacturing invites proposals for the supply and implementation of an integrated HRMS covering core HR, payroll, time and attendance, leave, recruitment, performance, learning and compensation for approximately 8,200 employees across two legal entities in India.

2. Background
The company currently operates a homegrown HR system supplemented by spreadsheets. The components business will be demerged into a separate legal entity in the next financial year. Finance runs Oracle Hyperion for planning. Identity is managed in Microsoft Entra ID.`,
  `3. Scope of work
The bidder shall provide software licences, implementation services, data migration, integration with biometric devices and finance systems, training and post go-live support.

4. Questions to bidders
Q1. Describe your implementation methodology, phases and typical timeline for an organisation of our size.
Q2. Describe your change-management approach, including leadership alignment, communication and persona-based training.
Q3. How will your solution handle the planned demerger, including re-mapping employees, positions and approval chains to the new entity?
Q4. Confirm support for Indian statutory payroll for two entities on separate pay calendars.
Q5. Describe attendance capture from biometric devices and geo-fenced mobile check-in.`,
  `Q6. Describe your data-migration approach and how the HRMS becomes the source of truth for employee and organisation data.
Q7. List security certifications, data residency options and single sign-on support.
Q8. Provide indicative pricing for licences, implementation and change management.

5. Evaluation
Proposals will be evaluated on functional fit (40%), implementation approach (25%), commercials (25%) and references (10%).

6. Submission
Proposals are due by 9 October 2026, 17:00 IST, by email to the procurement office.`,
];

async function makePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const pageText of PDF_PAGES) {
    const page = doc.addPage([595, 842]); // A4
    let y = 800;
    for (const line of wrap(pageText)) {
      page.drawText(line, { x: 48, y, size: 10.5, font, color: rgb(0.14, 0.15, 0.16) });
      y -= 15;
    }
  }
  await writeFile(path.join(OUT, "rfp-narrative.pdf"), await doc.save());
  return PDF_PAGES.length;
}

async function makeDocx() {
  const doc = new Document({
    creator: "RFP Studio fixtures",
    sections: [
      {
        children: [
          new Paragraph({ text: "Pointers for bidders — Apex Manufacturing (synthetic fixture)", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: "Context", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({
            children: [
              new TextRun(
                "The Board has approved the demerger of the components business into Apex Components Pvt Ltd, effective from the start of the next financial year. Around 2,100 employees, 140 positions and two plants move to the new entity. ",
              ),
              new TextRun({ text: "Payroll for the new entity must run separately from day one.", bold: true }),
            ],
          }),
          new Paragraph({ text: "What we care about", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: "A single employee master with a clean entity move, not two systems." }),
          new Paragraph({ text: "Unionised workmen at both plants have plant-specific overtime and allowance rules." }),
          new Paragraph({ text: "Finance runs Hyperion; bonus provisioning must reconcile with it." }),
          new Paragraph({ text: "Adoption is the risk: the last system was never fully used by managers." }),
          new Paragraph({ text: "Timeline", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: "Contract by December 2026; go-live for core HR and payroll before the demerger date." }),
        ],
      },
    ],
  });
  await writeFile(path.join(OUT, "client-pointers.docx"), await Packer.toBuffer(doc));
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const rows = await makeXlsx();
  const pages = await makePdf();
  await makeDocx();
  console.log(`[fixtures] hrms-rfp.xlsx (${rows} requirements), rfp-narrative.pdf (${pages} pages), client-pointers.docx → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
