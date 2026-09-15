import { parseDocx } from "./docx";
import { parsePdf } from "./pdf";
import { type ParsedDocument, type ParsedKind, type ParseInput, UnsupportedDocumentError } from "./types";
import { parseXlsx } from "./xlsx";

export * from "./types";

const BY_EXTENSION: Record<string, ParsedKind> = {
  xlsx: "xlsx",
  xlsm: "xlsx",
  pdf: "pdf",
  docx: "docx",
};

const BY_MIME: Record<string, ParsedKind> = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel.sheet.macroenabled.12": "xlsx",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** Which parser a file gets: the extension decides, the mime type breaks ties for anonymous uploads. */
export function detectKind(fileName: string, mime?: string | null): ParsedKind | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return BY_EXTENSION[ext] ?? (mime ? (BY_MIME[mime.toLowerCase()] ?? null) : null);
}

export async function parseDocument(input: ParseInput): Promise<ParsedDocument> {
  const kind = detectKind(input.fileName, input.mime);
  switch (kind) {
    case "xlsx":
      return parseXlsx(input.fileName, input.buffer);
    case "pdf":
      return parsePdf(input.fileName, input.buffer);
    case "docx":
      return parseDocx(input.fileName, input.buffer);
    default:
      throw new UnsupportedDocumentError(input.fileName, input.mime);
  }
}
