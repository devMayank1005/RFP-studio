import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { sampleBrand, sampleModel } from "./fixtures";
import { renderXlsx } from "./xlsx";

/** Render the fresh workbook and read it back with ExcelJS. */
async function load(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe("renderXlsx", () => {
  it("writes a Responses sheet, the client's columns first, then ours", async () => {
    const buf = await renderXlsx(sampleModel(), sampleBrand);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const wb = await load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Responses", "Summary"]);

    const ws = wb.getWorksheet("Responses")!;
    const headers = (ws.getRow(1).values as string[]).slice(1);
    expect(headers.slice(0, 7)).toEqual(["Sr No", "Explicit Requirement", "Acceptance Criteria / Minimum Expected Outcome", "Priority", "Solution", "Feasibility", "Other Remarks"]);
    expect(headers).toContain("Page");
    // The narrative question brings a client "Ref" column, so ours is prefixed.
    expect(headers.slice(-8)).toEqual(["Kognoz Ref", "Section", "Compliance", "Response", "Status", "Owner", "Open points", "Sources"]);
    expect(ws.rowCount).toBe(1 + 4);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
  });

  it("colours the header by who owns the column and wraps every body cell", async () => {
    const wb = await load(await renderXlsx(sampleModel(), sampleBrand));
    const ws = wb.getWorksheet("Responses")!;
    const clientHeader = ws.getCell("A1");
    const kognozHeader = ws.getRow(1).getCell(ws.columnCount);
    expect((clientHeader.fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF005184");
    expect((kognozHeader.fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF2B9E85");
    expect(clientHeader.font?.color?.argb).toBe("FFFFFFFF");
    expect(ws.getCell("B2").alignment?.wrapText).toBe(true);
  });

  it("fills rows from the client's data and our answers", async () => {
    const wb = await load(await renderXlsx(sampleModel(), sampleBrand));
    const ws = wb.getWorksheet("Responses")!;
    const headers = (ws.getRow(1).values as string[]).slice(1);
    const col = (h: string) => headers.indexOf(h) + 1;
    const first = ws.getRow(2);
    expect(first.getCell(col("Explicit Requirement")).value).toBe("Single sign-on with Azure AD for all employees");
    expect(first.getCell(col("Kognoz Ref")).value).toBe("A1");
    expect(first.getCell(col("Compliance")).value).toBe("Fully");
    expect(String(first.getCell(col("Response")).value)).toContain("SAML 2.0");
    expect(first.getCell(col("Status")).value).toBe("Approved");
    expect(first.getCell(col("Sources")).value).toBe("[1] SSO and identity");
    const third = ws.getRow(4);
    expect(third.getCell(col("Status")).value).toBe("Not drafted");
    expect(third.getCell(col("Response")).value ?? "").toBe("");
  });

  it("writes a Summary sheet whose counts add up", async () => {
    const wb = await load(await renderXlsx(sampleModel(), sampleBrand));
    const s = wb.getWorksheet("Summary")!;
    const rows = new Map<string, string>();
    s.eachRow((row) => rows.set(String(row.getCell(1).value ?? ""), String(row.getCell(2).value ?? "")));
    expect(rows.get("RFP")).toBe("Apex Manufacturing — HRMS implementation RFP");
    expect(rows.get("Questions")).toBe("4");
    expect(rows.get("Approved")).toBe("1");
    expect(rows.get("Edited")).toBe("1");
    expect(rows.get("Flagged")).toBe("1");
    expect(rows.get("Not drafted")).toBe("1");
    expect(rows.get("")).toBe(sampleBrand.footerText);
  });
});
