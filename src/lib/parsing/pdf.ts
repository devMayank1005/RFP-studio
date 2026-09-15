import { extractText, getDocumentProxy } from "unpdf";

import type { ParsedDocument, ParsedPage } from "./types";

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function parsePdf(fileName: string, buffer: Buffer | ArrayBuffer | Uint8Array): Promise<ParsedDocument> {
  const bytes = buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer);
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });

  const pages: ParsedPage[] = text.map((t, i) => ({ page: i + 1, text: tidy(t) }));
  const joined = pages.map((p) => `--- page ${p.page} ---\n${p.text}`).join("\n\n");
  return {
    kind: "pdf",
    fileName,
    pages,
    text: joined,
    stats: { pages: pages.length, chars: joined.length },
  };
}
