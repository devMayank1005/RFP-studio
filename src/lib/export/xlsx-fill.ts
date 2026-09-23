import ExcelJS from "exceljs";

import { APPENDED_HEADER, docxFont, fillCellValues, fillColumnPlan, matchQuestionsToRows, type ExportBrand, type ExportModel, type FillTarget, type MatchResult } from "@/domain/export";


/**
 * The client's own workbook, filled in: every question we could place is
 * written back into its row — the answer into their "Solution"-style column,
 * compliance into "Feasibility", open points into "Remarks" — and columns the
 * client did not provide are appended after their last one. Cell styles stay
 * the client's; unapproved answers get an amber tint and a note. A final
 * "Kognoz notes" sheet lists what could not be placed, for hand-finishing.
 */

export interface FillResult {
  buffer: Buffer;
  matched: number;
  unmatched: MatchResult["unmatched"];
  sheetsTouched: string[];
}

export const NOTES_SHEET = "Kognoz notes";
const UNAPPROVED_FILL = "FFFFF3CD";
const APPENDED_WIDTH: Record<FillTarget, number> = { response: 60, compliance: 16, remarks: 40 };

function norm(s: unknown): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Header text → column number, read from the sheet's real header row; bare column letters map to themselves. */
function headerColumns(ws: ExcelJS.Worksheet, headerRow: number): Map<string, number> {
  const map = new Map<string, number>();
  ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
    const key = norm(cell.text ?? cell.value);
    if (key && !map.has(key)) map.set(key, col);
  });
  return map;
}

function columnFor(header: string, ws: ExcelJS.Worksheet, columns: Map<string, number>): number | null {
  const found = columns.get(norm(header));
  if (found) return found;
  if (/^[A-Z]{1,3}$/.test(header)) return ws.getColumn(header).number;
  return null;
}

/** Fill the client's original workbook with the model's answers and add the "Kognoz notes" sheet; reports what was and was not placed. */
export async function renderXlsxFill(model: ExportModel, brand: ExportBrand, original: Buffer): Promise<FillResult> {
  const font = docxFont(brand.fontFamily);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(original as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const result = matchQuestionsToRows(model.questions, model.sheets);
  const byQuestion = new Map(model.questions.map((q) => [q.id, q]));
  const unmatched = [...result.unmatched];
  const rowsBySheet = new Map<string, Map<number, string[]>>();
  for (const [questionId, match] of Object.entries(result.matches)) {
    const rows = rowsBySheet.get(match.sheetName) ?? new Map<number, string[]>();
    rows.set(match.row, [...(rows.get(match.row) ?? []), questionId]);
    rowsBySheet.set(match.sheetName, rows);
  }

  let matched = 0;
  const sheetsTouched: string[] = [];
  const appended: string[] = [];
  for (const [sheetName, rows] of rowsBySheet) {
    const ws = wb.getWorksheet(sheetName);
    const parsed = model.sheets.find((s) => s.name === sheetName);
    if (!ws || !parsed) {
      for (const ids of rows.values()) for (const id of ids) unmatched.push({ questionId: id, refNo: byQuestion.get(id)?.refNo ?? id, reason: `sheet "${sheetName}" is not in the workbook` });
      continue;
    }
    sheetsTouched.push(sheetName);
    const columns = headerColumns(ws, parsed.headerRow);
    const plan = fillColumnPlan(parsed.headers);
    const target: Record<FillTarget, number | null> = {
      response: plan.answer ? columnFor(plan.answer, ws, columns) : null,
      compliance: plan.compliance ? columnFor(plan.compliance, ws, columns) : null,
      remarks: plan.remarks ? columnFor(plan.remarks, ws, columns) : null,
    };
    const questionsCol = plan.questions ? columnFor(plan.questions, ws, columns) : null;
    const lastHeaderCol = Math.max(ws.columnCount, ...[...columns.values()]);
    const headerStyle = ws.getCell(parsed.headerRow, lastHeaderCol).style;
    let next = lastHeaderCol + 1;
    for (const field of ["response", "compliance", "remarks"] as const) {
      if (target[field]) continue;
      const col = next++;
      const header = ws.getCell(parsed.headerRow, col);
      header.value = APPENDED_HEADER[field];
      // Match the client's own header row rather than branding one cell of it.
      header.style = { ...headerStyle };
      ws.getColumn(col).width = APPENDED_WIDTH[field];
      target[field] = col;
      appended.push(`${APPENDED_HEADER[field]} (${sheetName})`);
    }

    for (const [rowNumber, ids] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      const questions = ids.map((id) => byQuestion.get(id)!).sort((a, b) => a.sortOrder - b.sortOrder);
      const values = fillCellValues(questions, { separateQuestions: questionsCol !== null });
      const row = ws.getRow(rowNumber);
      const write = (col: number | null, text: string) => {
        if (!col || !text) return;
        const cell = row.getCell(col);
        cell.value = text;
        cell.alignment = { ...(cell.alignment ?? {}), vertical: "top", wrapText: true };
        if (values.unapproved.length) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: UNAPPROVED_FILL } };
          cell.note = `Not yet approved in RFP Studio (${values.unapproved.join(", ")}). Review before sending.`;
        }
      };
      write(target.response, values.text);
      write(target.compliance, values.compliance);
      write(target.remarks, values.remarks);
      write(questionsCol, values.questions);
      row.commit();
      matched += questions.length;
    }
  }

  const notes = wb.addWorksheet(NOTES_SHEET);
  notes.columns = [
    { key: "a", width: 14 },
    { key: "b", width: 70 },
    { key: "c", width: 40 },
  ];
  notes.addRow({ a: "RFP", b: model.rfp.title });
  notes.addRow({ a: "Generated", b: model.generatedOn });
  notes.addRow({ a: "Written back", b: `${matched} of ${model.questions.length} questions` });
  notes.addRow({ a: "Answers", b: model.options.approvedOnly ? "Approved answers only" : `All answers; ${model.readiness.unapproved} not yet approved are tinted amber with a note` });
  if (appended.length) notes.addRow({ a: "Added columns", b: appended.join(", ") });
  notes.addRow({});
  if (unmatched.length) {
    const head = notes.addRow({ a: "Not written back", b: "Question", c: "Why" });
    head.font = { name: font, size: 10, bold: true };
    for (const u of unmatched) {
      const q = byQuestion.get(u.questionId);
      notes.addRow({ a: u.refNo, b: q?.questionText ?? "", c: u.reason });
    }
  } else {
    notes.addRow({ a: "", b: "Every question was written back into the workbook." });
  }
  notes.getColumn(1).font = { name: font, size: 10, bold: true };
  notes.eachRow((row) => row.eachCell({ includeEmpty: false }, (cell) => (cell.alignment = { vertical: "top", wrapText: true })));

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), matched, unmatched, sheetsTouched };
}
