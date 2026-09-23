import { strFromU8, unzipSync } from "fflate";

import type { ParsedDocument } from "./types";

/**
 * PowerPoint decks — Kognoz proposals and past RFP responses live in them.
 * A .pptx is a zip; each slide is ppt/slides/slideN.xml and every visible
 * text run is an <a:t>. Runs are joined per paragraph, paragraphs per slide,
 * and each slide with any text becomes one page in deck order.
 */
export async function parsePptx(fileName: string, buffer: Buffer | ArrayBuffer | Uint8Array): Promise<ParsedDocument> {
  const buf = buffer instanceof Buffer ? buffer : Buffer.from(buffer as ArrayBuffer);
  const files = unzipSync(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  const slideNumber = (name: string) => Number(/slide(\d+)\.xml$/.exec(name)?.[1] ?? 0);
  const slides = Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const texts = slides.map((name) => slideText(strFromU8(files[name]))).filter((t) => t.length > 0);
  const pages = texts.map((text, i) => ({ page: i + 1, text }));
  const text = pages.map((p) => p.text).join("\n\n");
  return { kind: "pptx", fileName, pages, text, stats: { pages: pages.length, chars: text.length } };
}

function slideText(xml: string): string {
  const paragraphs: string[] = [];
  for (const p of xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)) {
    const runs = [...p[0].matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((r) => decodeXml(r[1]));
    const line = runs.join("").replace(/\s+/g, " ").trim();
    if (line) paragraphs.push(line);
  }
  return paragraphs.join("\n");
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}
