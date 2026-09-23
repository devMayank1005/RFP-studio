import type { ParsedDocument } from "./types";

/**
 * Markdown and plain text: chat transcripts, notes, exported documents. A
 * level-one heading starts a new page so the ingest chunker sees natural
 * sections; a file without headings is one page.
 */
export function parseText(fileName: string, buffer: Buffer | ArrayBuffer | Uint8Array): ParsedDocument {
  const buf = buffer instanceof Buffer ? buffer : Buffer.from(buffer as ArrayBuffer);
  const text = buf.toString("utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  const sections: string[] = [];
  let current: string[] = [];
  for (const line of text.split("\n")) {
    if (/^# /.test(line) && current.some((l) => l.trim())) {
      sections.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }
  if (current.some((l) => l.trim())) sections.push(current.join("\n").trim());

  const pages = (sections.length ? sections : [text]).map((t, i) => ({ page: i + 1, text: t }));
  return { kind: "text", fileName, pages, text, stats: { pages: pages.length, chars: text.length } };
}
