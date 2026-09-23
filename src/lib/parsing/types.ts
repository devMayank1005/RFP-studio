/**
 * The normalised shape every parser produces. Deterministic text extraction
 * happens here; the engine only ever sees this, never a raw file.
 */

/** "text" covers markdown, plain text and Quick Q&A pastes; "pptx" is one page per slide. */
export type ParsedKind = "xlsx" | "pdf" | "docx" | "pptx" | "text";

export interface ParsedRow {
  /** 1-based row number in the original sheet — it is what the reviewer sees in Excel. */
  row: number;
  /** Cell values keyed by the header text, verbatim. Empty cells are omitted. */
  cells: Record<string, string>;
}

export interface ParsedSheet {
  name: string;
  /** 1-based row the headers were found on. */
  headerRow: number;
  headers: string[];
  rows: ParsedRow[];
}

export interface ParsedPage {
  page: number;
  text: string;
}

export interface ParsedDocument {
  kind: ParsedKind;
  fileName: string;
  sheets?: ParsedSheet[];
  pages?: ParsedPage[];
  /** Everything as plain text, for embedding and for the brief. */
  text: string;
  stats: { sheets?: number; rows?: number; pages?: number; chars: number };
}

export interface ParseInput {
  fileName: string;
  mime?: string | null;
  buffer: Buffer | ArrayBuffer | Uint8Array;
}

/** Thrown by `parseDocument` when a file's extension and mime type name no parser; the message is safe to show the user. */
export class UnsupportedDocumentError extends Error {
  constructor(fileName: string, mime?: string | null) {
    super(`Unsupported document: ${fileName}${mime ? ` (${mime})` : ""}. Upload .xlsx, .pdf or .docx.`);
    this.name = "UnsupportedDocumentError";
  }
}
