import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildExportModel, type ExportSheet } from "@/domain/export";

import { sampleBrand, sampleModel, sampleSheet, sampleSource } from "./fixtures";
import { NOTES_SHEET, renderXlsxFill } from "./xlsx-fill";

/** The client's workbook, as they sent it: the sample sheet laid out for real. */
async function clientWorkbook(sheet: ExportSheet, extra?: (ws: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet.name);
  ws.getRow(sheet.headerRow).values = sheet.headers;
  ws.getRow(sheet.headerRow).font = { bold: true };
  for (const r of sheet.rows) {
    for (const [header, value] of Object.entries(r.cells)) ws.getCell(r.row, sheet.headers.indexOf(header) + 1).value = value;
  }
  extra?.(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function load(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe("renderXlsxFill", () => {
  it("writes answers into the client's own columns and keeps their sheet intact", async () => {
    const original = await clientWorkbook(sampleSheet, (ws) => {
      ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDDDDD" } };
    });
    const { buffer, matched, unmatched, sheetsTouched } = await renderXlsxFill(sampleModel(), sampleBrand, original);
    expect(sheetsTouched).toEqual(["Functional"]);
    expect(matched).toBe(3);
    expect(unmatched.map((u) => u.refNo)).toEqual(["X1"]);

    const wb = await load(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Functional", NOTES_SHEET]);
    const ws = wb.getWorksheet("Functional")!;
    const col = (h: string) => sampleSheet.headers.indexOf(h) + 1;
    expect(String(ws.getCell(2, col("Solution")).value)).toContain("SAML 2.0");
    expect(ws.getCell(2, col("Feasibility")).value).toBe("Fully");
    expect(ws.getCell(2, col("Explicit Requirement")).value).toBe("Single sign-on with Azure AD for all employees");
    expect((ws.getCell("A1").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFDDDDDD");
    expect(ws.getCell(2, col("Solution")).note).toBeUndefined();
    // Row 3 is edited, not approved: tinted and annotated.
    expect(ws.getCell(3, col("Feasibility")).value).toBe("Partial");
    expect(String(ws.getCell(3, col("Other Remarks")).value)).toContain("Confirm the device vendor");
    expect((ws.getCell(3, col("Solution")).fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFFFF3CD");
    expect(String(ws.getCell(3, col("Solution")).note)).toContain("Not yet approved");
    // Row 4 has no answer: left alone.
    expect(ws.getCell(4, col("Solution")).value).toBeNull();
    // Row 5 was never a question.
    expect(ws.getCell(5, col("Solution")).value).toBeNull();

    const notes = wb.getWorksheet(NOTES_SHEET)!;
    const flat = notes.getSheetValues().flat().map(String).join("\n");
    expect(flat).toContain("3 of 4 questions");
    expect(flat).toContain("X1");
    expect(flat).toContain("not in the parsed workbook");
  });

  it("appends Kognoz columns when the client's sheet has no room for answers", async () => {
    const sheet: ExportSheet = {
      documentId: "doc-1",
      name: "Reqs",
      headerRow: 1,
      headers: ["Requirement", "Priority"],
      rows: [{ row: 2, cells: { Requirement: "Single sign-on with Azure AD for all employees", Priority: "High" } }],
    };
    const source = sampleSource();
    const model = buildExportModel({ ...source, sheets: [sheet], questions: source.questions.filter((q) => q.id === "a1") });
    const { buffer, matched } = await renderXlsxFill(model, sampleBrand, await clientWorkbook(sheet));
    expect(matched).toBe(1);
    const ws = (await load(buffer)).getWorksheet("Reqs")!;
    expect(ws.getCell(1, 3).value).toBe("Kognoz response");
    expect(ws.getCell(1, 4).value).toBe("Kognoz compliance");
    expect(ws.getCell(1, 5).value).toBe("Kognoz remarks");
    expect(String(ws.getCell(2, 3).value)).toContain("SAML 2.0");
    expect(ws.getCell(2, 4).value).toBe("Fully");
    // Appended headers copy the client's header style (bold, no fill) instead of being branded.
    expect(ws.getCell(1, 3).font?.bold).toBe(true);
    expect((ws.getCell(1, 3).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb).toBeUndefined();
    const notes = (await load(buffer)).getWorksheet(NOTES_SHEET)!;
    expect(notes.getSheetValues().flat().map(String).join("\n")).toContain("Kognoz response (Reqs)");
  });
});
