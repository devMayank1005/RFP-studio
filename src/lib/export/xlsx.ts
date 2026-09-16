import ExcelJS from "exceljs";

import { argb, COMPLIANCE_INK, docxFont, INK_HEX, STATUS_INK, xlsxColumnPlan, xlsxRowValues, xlsxSummaryRows, type ExportBrand, type ExportModel, type Ink } from "@/domain/export";

/**
 * The fresh Excel export: a "Responses" sheet with the client's own columns
 * first (their header order) and the Kognoz columns after, then a "Summary"
 * sheet. Column order and every cell value come from the domain plan; this
 * file only knows ExcelJS.
 */

const WHITE = "FFFFFFFF";

export function inkArgb(ink: Ink, brand: ExportBrand): string {
  switch (ink) {
    case "primary":
      return argb(brand.primaryColor, "005184");
    case "accent":
      return argb(brand.accentColor, "2B9E85");
    case "success":
      return argb(brand.successColor, "71A247");
    default:
      return `FF${INK_HEX[ink]}`;
  }
}

export async function renderXlsx(model: ExportModel, brand: ExportBrand): Promise<Buffer> {
  const font = docxFont(brand.fontFamily);
  const wb = new ExcelJS.Workbook();
  wb.creator = brand.name;
  wb.created = new Date(model.generatedAt);

  const ws = wb.addWorksheet("Responses", { views: [{ state: "frozen", ySplit: 1 }] });
  const plan = xlsxColumnPlan(model);
  ws.columns = plan.map((c) => ({ key: c.key, header: c.header, width: c.width }));
  for (const q of model.questions) ws.addRow(xlsxRowValues(q, plan));

  const header = ws.getRow(1);
  header.height = 24;
  plan.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: inkArgb(col.kind === "client" ? "primary" : "accent", brand) } };
    cell.font = { name: font, size: 10, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  const at = (field: string) => plan.findIndex((c) => c.field === field) + 1;
  const refCol = at("ref");
  const complianceCol = at("compliance");
  const statusCol = at("status");
  model.questions.forEach((q, i) => {
    const row = ws.getRow(i + 2);
    for (let c = 1; c <= plan.length; c++) {
      const cell = row.getCell(c);
      cell.alignment = { vertical: "top", wrapText: true };
      cell.font = { name: font, size: 10 };
    }
    if (q.isMandatory) row.getCell(refCol).font = { name: font, size: 10, bold: true };
    if (q.answer?.compliance) row.getCell(complianceCol).font = { name: font, size: 10, bold: true, color: { argb: inkArgb(COMPLIANCE_INK[q.answer.compliance], brand) } };
    row.getCell(statusCol).font = { name: font, size: 10, color: { argb: q.answer ? inkArgb(STATUS_INK[q.answer.status], brand) : inkArgb("muted", brand) } };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: plan.length } };

  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { key: "k", width: 28 },
    { key: "v", width: 80 },
  ];
  for (const [k, v] of xlsxSummaryRows(model, brand.footerText)) summary.addRow({ k, v });
  summary.getColumn(1).font = { name: font, size: 10, bold: true };
  summary.getColumn(2).font = { name: font, size: 10 };
  summary.getColumn(2).alignment = { vertical: "top", wrapText: true };
  summary.getRow(1).font = { name: font, size: 12, bold: true, color: { argb: inkArgb("primary", brand) } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
