import { AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, SectionType, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

import { brandHex, chroThemeLabel, COMPLIANCE_INK, deepBrandHex, docxFont, docxOutline, INK_HEX, STATUS_INK, type DocxNode, type ExecutiveSummary, type ExportBrand, type ExportModel, type Ink } from "@/domain/export";

import type { LogoAsset } from "./logo";

/**
 * The Word export: a branded cover, the executive summary, an overview
 * table, every section with its questions and answers, and the CHRO
 * appendix. The outline comes from the domain; this file only knows how
 * `docx` spells paragraphs, runs, tables and page numbers.
 */

/** Half-points, as Word counts them. */
const SIZE = { body: 22, small: 16, meta: 18, h1: 32, h2: 26, title: 44, cover: 26 } as const;
const MARGIN = 1440; // 1 inch in twips
const LOGO_WIDTH_PX = 180;

interface Palette {
  primary: string;
  deep: string;
  accent: string;
  success: string;
  amber: string;
  red: string;
  muted: string;
  ink: string;
  font: string;
}

function palette(brand: ExportBrand): Palette {
  return {
    primary: brandHex(brand.primaryColor, "005184"),
    deep: deepBrandHex(brand.primaryColor, "003D63"),
    accent: brandHex(brand.accentColor, "2B9E85"),
    success: brandHex(brand.successColor, "71A247"),
    amber: INK_HEX.amber,
    red: INK_HEX.red,
    muted: INK_HEX.muted,
    ink: "1F2937",
    font: docxFont(brand.fontFamily),
  };
}

function inkHex(ink: Ink, p: Palette): string {
  return p[ink];
}

function fit(logo: LogoAsset, width: number): { width: number; height: number } {
  return { width, height: Math.max(1, Math.round((width * logo.height) / logo.width)) };
}

function run(text: string, p: Palette, over: Partial<ConstructorParameters<typeof TextRun>[0] & object> = {}): TextRun {
  return new TextRun({ text, font: p.font, size: SIZE.body, color: p.ink, ...over });
}

function para(children: TextRun[], over: Partial<ConstructorParameters<typeof Paragraph>[0] & object> = {}): Paragraph {
  return new Paragraph({ children, ...over });
}

function renderCover(node: Extract<DocxNode, { kind: "cover" }>, p: Palette, brand: ExportBrand, logo: LogoAsset | null): Paragraph[] {
  const out: Paragraph[] = [];
  if (logo) {
    out.push(
      new Paragraph({
        children: [new ImageRun({ type: logo.type, data: logo.data, transformation: fit(logo, LOGO_WIDTH_PX), altText: { title: "Logo", description: brand.name, name: "logo" } })],
        spacing: { after: 720 },
      }),
    );
  } else {
    out.push(para([run(brand.name, p, { bold: true, size: SIZE.cover, color: p.primary })], { spacing: { after: 720 } }));
  }
  out.push(para([run("RFP response", p, { size: SIZE.small, color: p.muted, allCaps: true, characterSpacing: 40 })], { spacing: { after: 120 } }));
  out.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [run(node.title, p, { bold: true, size: SIZE.title, color: p.primary })] }));
  out.push(para([run(`Prepared for ${node.client}`, p, { size: SIZE.cover })], { spacing: { after: 120 } }));
  out.push(para([run(`Prepared by ${brand.name} · ${node.date}`, p, { color: p.muted })], { spacing: { after: 240 } }));
  out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: p.accent, space: 1 } }, spacing: { before: 240, after: 360 } }));
  out.push(para([run(`${node.readiness.approved} of ${node.readiness.total} answers approved at the time of export.`, p, { size: SIZE.meta, color: p.muted })], { spacing: { after: 2400 } }));
  if (node.footerText) out.push(para([run(node.footerText, p, { size: SIZE.small, color: p.muted })]));
  return out;
}

function overviewTable(rows: Array<[string, string]>, p: Palette): Table {
  const cell = (text: string, opts: { label?: boolean }) =>
    new TableCell({
      children: [para([run(text, p, { bold: !!opts.label, size: SIZE.meta })], { spacing: { before: 60, after: 60 } })],
      width: { size: opts.label ? 2800 : 6560, type: WidthType.DXA },
      shading: opts.label ? { type: ShadingType.CLEAR, fill: "F3F4F6", color: "auto" } : undefined,
      margins: { left: 120, right: 120 },
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [2800, 6560],
    rows: rows.map(([k, v]) => new TableRow({ children: [cell(k, { label: true }), cell(v, {})] })),
  });
}

function renderNode(node: DocxNode, p: Palette): Array<Paragraph | Table> {
  switch (node.kind) {
    case "cover":
      return [];
    case "heading":
      return [new Paragraph({ heading: node.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, pageBreakBefore: node.pageBreakBefore, children: [run(node.text, p, { bold: true, size: node.level === 1 ? SIZE.h1 : SIZE.h2, color: node.level === 1 ? p.primary : p.deep })] })];
    case "paragraph":
      return [para([run(node.text, p, node.muted ? { italics: true, color: p.muted } : {})], { spacing: { after: 160 } })];
    case "summary": {
      const out: Array<Paragraph | Table> = node.paragraphs.map((text) => para([run(text, p)], { spacing: { after: 160 } }));
      if (node.highlights.length) {
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run("Why Kognoz and Darwinbox", p, { bold: true, size: SIZE.h2, color: p.deep })] }));
        for (const h of node.highlights) out.push(para([run(h, p)], { bullet: { level: 0 }, spacing: { after: 60 } }));
      }
      return out;
    }
    case "overview":
      return [overviewTable(node.rows, p), para([], { spacing: { after: 120 } })];
    case "question": {
      const out: Array<Paragraph | Table> = [];
      out.push(para([run(node.refNo, p, { bold: true, color: p.primary }), run(`  ${node.question}`, p, { bold: true })], { keepNext: true, spacing: { before: 280, after: 60 } }));
      const [lead, ...rest] = node.meta.split(" · ");
      const leadInk = node.compliance ? inkHex(COMPLIANCE_INK[node.compliance], p) : node.status ? inkHex(STATUS_INK[node.status], p) : p.muted;
      out.push(para([run(lead, p, { bold: true, size: SIZE.meta, color: leadInk }), ...(rest.length ? [run(` · ${rest.join(" · ")}`, p, { size: SIZE.meta, color: p.muted })] : [])], { keepNext: true, spacing: { after: 100 } }));
      if (!node.status) out.push(para([run("No response drafted.", p, { italics: true, color: p.muted })], { spacing: { after: 120 } }));
      for (const block of node.blocks) {
        if (block.kind === "paragraph") out.push(para([run(block.text, p)], { spacing: { after: 120 } }));
        else for (const item of block.items) out.push(para([run(item, p)], { bullet: { level: 0 }, spacing: { after: 40 } }));
      }
      if (node.flagReason) out.push(para([run(`Flagged: ${node.flagReason}`, p, { size: SIZE.meta, color: p.amber })], { spacing: { after: 80 } }));
      if (node.openPoints.length) {
        out.push(para([run("Open points", p, { bold: true, size: SIZE.meta, color: p.amber })], { keepNext: true, spacing: { after: 40 } }));
        for (const item of node.openPoints) out.push(para([run(item, p, { size: SIZE.meta })], { bullet: { level: 0 }, spacing: { after: 40 } }));
      }
      if (node.sources) out.push(para([run(`Sources: ${node.sources}`, p, { size: SIZE.small, italics: true, color: p.muted })], { spacing: { after: 120 } }));
      return out;
    }
    case "chro": {
      const out: Array<Paragraph | Table> = [new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(chroThemeLabel(node.theme), p, { bold: true, size: SIZE.h2, color: p.deep })] })];
      for (const q of node.questions) {
        out.push(para([run(q.text, p)], { bullet: { level: 0 }, spacing: { after: 20 } }));
        if (q.rationale) out.push(para([run(q.rationale, p, { size: SIZE.small, italics: true, color: p.muted })], { indent: { left: 720 }, spacing: { after: 100 } }));
      }
      return out;
    }
  }
}

/** Render the outline as a Word file: a cover section, then the body under a running header and a page-numbered footer. */
export async function renderDocx(model: ExportModel, brand: ExportBrand, summary: ExecutiveSummary | null, logo: LogoAsset | null): Promise<Buffer> {
  const p = palette(brand);
  const nodes = docxOutline(model, summary, brand.footerText);
  const cover = nodes.find((n): n is Extract<DocxNode, { kind: "cover" }> => n.kind === "cover")!;
  const margin = { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN };
  const small = { font: p.font, size: SIZE.small, color: p.muted };

  const doc = new Document({
    creator: brand.name,
    title: `${model.rfp.title} — response`,
    description: model.client.name,
    styles: {
      default: {
        document: { run: { font: p.font, size: SIZE.body, color: p.ink } },
        title: { run: { font: p.font, size: SIZE.title, bold: true, color: p.primary }, paragraph: { spacing: { after: 240 } } },
        heading1: { run: { font: p.font, size: SIZE.h1, bold: true, color: p.primary }, paragraph: { spacing: { before: 360, after: 160 }, keepNext: true } },
        heading2: { run: { font: p.font, size: SIZE.h2, bold: true, color: p.deep }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true } },
      },
    },
    sections: [
      { properties: { page: { margin } }, children: renderCover(cover, p, brand, logo) },
      {
        properties: { type: SectionType.NEXT_PAGE, page: { margin } },
        headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${model.rfp.title} · ${model.client.name}`, ...small })] })] }) },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: brand.footerText ? `${brand.footerText}   ·   Page ` : "Page ", ...small }),
                  new TextRun({ children: [PageNumber.CURRENT], ...small }),
                  new TextRun({ text: " of ", ...small }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], ...small }),
                ],
              }),
            ],
          }),
        },
        children: nodes.flatMap((n) => renderNode(n, p)),
      },
    ],
  });
  return Packer.toBuffer(doc);
}
