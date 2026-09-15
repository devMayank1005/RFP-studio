import mammoth from "mammoth";

import type { ParsedDocument } from "./types";

/**
 * Word documents have no fixed pages, so the whole text is one "page". The
 * extractor keeps a blank line between paragraphs, which is what the chunker
 * splits on later.
 */
export async function parseDocx(fileName: string, buffer: Buffer | ArrayBuffer | Uint8Array): Promise<ParsedDocument> {
  const buf = buffer instanceof Buffer ? buffer : Buffer.from(buffer as ArrayBuffer);
  const { value } = await mammoth.extractRawText({ buffer: buf });
  const text = value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    kind: "docx",
    fileName,
    pages: [{ page: 1, text }],
    text,
    stats: { pages: 1, chars: text.length },
  };
}
