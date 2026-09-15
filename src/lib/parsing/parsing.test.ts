import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseDocument } from "./index";
import { UnsupportedDocumentError } from "./types";

const PUBLIC = path.join(process.cwd(), "fixtures", "public");
const PRIVATE = path.join(process.cwd(), "fixtures", "private");
const VEDANTA = path.join(PRIVATE, "vedanta-hr-transformation.xlsx");

async function load(dir: string, fileName: string) {
  return parseDocument({ fileName, buffer: await readFile(path.join(dir, fileName)) });
}

describe("parseDocument · xlsx", () => {
  it("finds the header row below a merged title row and keys cells by header", async () => {
    const doc = await load(PUBLIC, "hrms-rfp.xlsx");
    expect(doc.kind).toBe("xlsx");
    const req = doc.sheets?.[0];
    expect(req?.name).toBe("Requirements");
    expect(req?.headerRow).toBe(3);
    expect(req?.headers).toEqual([
      "S.No",
      "Module",
      "Requirement",
      "Priority (M/S/C)",
      "Vendor Response (Y/P/N)",
      "Remarks",
    ]);
    expect(req?.rows[0]).toEqual({
      row: 4,
      cells: {
        "S.No": "1",
        Module: "Core HR",
        Requirement: "Maintain a single employee master for both legal entities with entity-specific custom fields.",
        "Priority (M/S/C)": "M",
      },
    });
  });

  it("skips blank spacer rows but keeps original row numbers", async () => {
    const doc = await load(PUBLIC, "hrms-rfp.xlsx");
    const req = doc.sheets![0];
    expect(req.rows).toHaveLength(40);
    const payrollFirst = req.rows.find((r) => r.cells.Module === "Payroll")!;
    // Five Core HR rows on 4–8, blank on 9, Payroll starts on 10.
    expect(payrollFirst.row).toBe(10);
  });

  it("preserves multi-line cell text", async () => {
    const doc = await load(PUBLIC, "hrms-rfp.xlsx");
    const row = doc.sheets![0].rows.find((r) => r.cells.Requirement?.startsWith("Digital maker"))!;
    expect(row.cells.Requirement).toContain("\n- joining bonus\n- retention bonus");
  });

  it("reads every sheet, renders dates as ISO days and numbers as plain strings", async () => {
    const doc = await load(PUBLIC, "hrms-rfp.xlsx");
    expect(doc.sheets?.map((s) => s.name)).toEqual(["Requirements", "Instructions", "Commercials"]);
    const comm = doc.sheets![2];
    expect(comm.headerRow).toBe(1);
    expect(comm.rows[0].cells).toMatchObject({ Item: "Licences", Qty: "8200", "Needed by": "2026-12-31" });
    expect(comm.rows[2].cells["Needed by"]).toBeUndefined();
    expect(doc.stats).toMatchObject({ sheets: 3 });
    expect(doc.text).toContain("Respond to each requirement");
  });

  it.skipIf(!existsSync(VEDANTA))("parses the real Vedanta requirements sheet", async () => {
    const doc = await load(PRIVATE, "vedanta-hr-transformation.xlsx");
    const sheet = doc.sheets![0];
    expect(sheet.headerRow).toBe(1);
    expect(sheet.headers[0]).toBe("Explicit Requirement");
    expect(sheet.headers).toContain("Feasibility");
    expect(sheet.rows).toHaveLength(249);
    expect(sheet.rows[0].row).toBe(2);
    // Sheet2 is empty in the source and must not produce a phantom sheet.
    expect(doc.sheets!.every((s) => s.rows.length > 0)).toBe(true);
  });
});

describe("parseDocument · pdf", () => {
  it("extracts text per page", async () => {
    const doc = await load(PUBLIC, "rfp-narrative.pdf");
    expect(doc.kind).toBe("pdf");
    expect(doc.pages).toHaveLength(3);
    expect(doc.pages![0].page).toBe(1);
    expect(doc.pages![0].text).toContain("Request for Proposal");
    expect(doc.pages![1].text).toContain("Q1.");
    expect(doc.text).toContain("Q8.");
    expect(doc.stats).toMatchObject({ pages: 3 });
  });
});

describe("parseDocument · docx", () => {
  it("extracts paragraphs as text", async () => {
    const doc = await load(PUBLIC, "client-pointers.docx");
    expect(doc.kind).toBe("docx");
    expect(doc.text).toContain("demerger of the components business");
    expect(doc.text).toContain("Payroll for the new entity must run separately");
    expect(doc.pages).toHaveLength(1);
    expect(doc.stats.chars).toBeGreaterThan(300);
  });
});

describe("parseDocument · dispatch", () => {
  it("chooses the parser from the extension, falling back to the mime type", async () => {
    const buffer = await readFile(path.join(PUBLIC, "client-pointers.docx"));
    const byMime = await parseDocument({
      fileName: "upload.bin",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer,
    });
    expect(byMime.kind).toBe("docx");
  });

  it("refuses unknown formats with a typed error", async () => {
    await expect(parseDocument({ fileName: "notes.txt", mime: "text/plain", buffer: Buffer.from("hi") })).rejects.toBeInstanceOf(
      UnsupportedDocumentError,
    );
  });
});
