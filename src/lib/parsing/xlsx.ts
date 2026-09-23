import ExcelJS from "exceljs";

import type { ParsedDocument, ParsedRow, ParsedSheet } from "./types";

/**
 * Turns a cell into the string a reviewer would read in Excel. Rich text is
 * flattened, formulas give their result, dates become ISO days (or datetimes
 * when they carry a time), and anything empty becomes undefined so the row
 * omits it.
 */
function cellText(value: ExcelJS.CellValue): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return clean(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return isoDate(value);
  if (typeof value === "object") {
    if ("richText" in value) return clean(value.richText.map((r) => r.text).join(""));
    if ("formula" in value || "sharedFormula" in value) return cellText((value as ExcelJS.CellFormulaValue).result ?? null);
    if ("hyperlink" in value) {
      const text = (value as ExcelJS.CellHyperlinkValue).text;
      return cellText(typeof text === "string" ? text : ((text as { richText?: { text: string }[] })?.richText?.map((r) => r.text).join("") ?? null));
    }
    if ("error" in value) return undefined;
  }
  return clean(String(value));
}

function clean(s: string): string | undefined {
  const trimmed = s.replace(/\r\n?/g, "\n").replace(/^[ \t\n]+|[ \t\n]+$/g, "");
  return trimmed === "" ? undefined : trimmed;
}

function isoDate(d: Date): string {
  const hasTime = d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds();
  const day = d.toISOString().slice(0, 10);
  return hasTime ? d.toISOString() : day;
}

function columnLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

interface RawRow {
  row: number;
  cells: Map<number, string>;
}

function readRows(ws: ExcelJS.Worksheet): RawRow[] {
  const rows: RawRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells = new Map<number, string>();
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      // A merged range reports the master's value on every cell it covers; a
      // merged title row would otherwise look like a six-column text header.
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const text = cellText(cell.value);
      if (text !== undefined) cells.set(col, text);
    });
    if (cells.size) rows.push({ row: rowNumber, cells });
  });
  return rows;
}

/**
 * The header row is the first row with at least two non-empty cells that are
 * all text — a merged title above it has one cell, a data row usually has a
 * number somewhere. Scans the top 25 rows; beyond that a sheet has no header.
 */
function findHeaderRow(rows: RawRow[]): RawRow | null {
  for (const row of rows.slice(0, 25)) {
    if (row.cells.size < 2) continue;
    const allText = [...row.cells.values()].every((v) => Number.isNaN(Number(v)) && !/^\d{4}-\d{2}-\d{2}/.test(v));
    if (allText) return row;
  }
  return null;
}

function toSheet(ws: ExcelJS.Worksheet): ParsedSheet | null {
  const raw = readRows(ws);
  if (!raw.length) return null;

  const header = findHeaderRow(raw);
  const maxCol = Math.max(...raw.map((r) => Math.max(...r.cells.keys())));
  const headerByCol = new Map<number, string>();
  if (header) {
    for (const [col, text] of header.cells) headerByCol.set(col, text);
  }
  // Columns with data but no header get their column letter, so nothing is dropped.
  for (let col = 1; col <= maxCol; col++) {
    if (!headerByCol.has(col) && raw.some((r) => r.cells.has(col) && r !== header)) headerByCol.set(col, columnLetter(col));
  }
  const orderedCols = [...headerByCol.keys()].sort((a, b) => a - b);
  const headers = orderedCols.map((c) => headerByCol.get(c)!);

  const rows: ParsedRow[] = [];
  for (const r of raw) {
    if (header && r.row <= header.row) continue;
    const cells: Record<string, string> = {};
    for (const col of orderedCols) {
      const v = r.cells.get(col);
      if (v !== undefined) cells[headerByCol.get(col)!] = v;
    }
    if (Object.keys(cells).length) rows.push({ row: r.row, cells });
  }
  if (!rows.length) return null;

  return { name: ws.name, headerRow: header?.row ?? 0, headers, rows };
}

function sheetText(sheet: ParsedSheet): string {
  const lines = [`## Sheet: ${sheet.name}`];
  for (const r of sheet.rows) {
    lines.push(`Row ${r.row}: ` + Object.entries(r.cells).map(([k, v]) => `${k}: ${v.replace(/\n/g, " / ")}`).join(" | "));
  }
  return lines.join("\n");
}

/** Parse a workbook with ExcelJS: one `ParsedSheet` per sheet that has data rows; `text` renders every sheet line by line for embedding. */
export async function parseXlsx(fileName: string, buffer: Buffer | ArrayBuffer | Uint8Array): Promise<ParsedDocument> {
  const wb = new ExcelJS.Workbook();
  const buf = buffer instanceof Buffer ? buffer : Buffer.from(buffer as ArrayBuffer);
  // ExcelJS types its Buffer against an older @types/node; the value is a plain Node Buffer.
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const sheets = wb.worksheets.map(toSheet).filter((s): s is ParsedSheet => s !== null);
  const text = sheets.map(sheetText).join("\n\n");
  return {
    kind: "xlsx",
    fileName,
    sheets,
    text,
    stats: { sheets: sheets.length, rows: sheets.reduce((n, s) => n + s.rows.length, 0), chars: text.length },
  };
}
