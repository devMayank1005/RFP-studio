import type { ExecutiveSummary, ExportBrand, ExportModel } from "@/domain/export";
import type { ExportFormat } from "@/domain/enums";

import { renderDocx } from "./docx";
import type { LogoAsset } from "./logo";
import { renderXlsx } from "./xlsx";
import { renderXlsxFill } from "./xlsx-fill";

/**
 * One renderer per format. The deck has none yet — the domain marks it
 * unavailable and the action refuses it, so a null here is never reached
 * from the UI.
 */

export interface RenderInput {
  model: ExportModel;
  brand: ExportBrand;
  summary: ExecutiveSummary | null;
  logo: LogoAsset | null;
  /** The client's original workbook, for the "fill" shape. */
  original: Buffer | null;
}

export interface RenderOutput {
  buffer: Buffer;
  /** Fill mode only: how much of the workbook was written back. */
  writeBack?: { matched: number; unmatched: number; sheets: string[] };
}

export type Renderer = (input: RenderInput) => Promise<RenderOutput>;

export const renderers: Record<ExportFormat, Renderer | null> = {
  xlsx: async ({ model, brand, original }) => {
    if (model.options.shape === "fill") {
      if (!original) throw new Error("The client's workbook is no longer available; build a fresh workbook instead.");
      const { buffer, matched, unmatched, sheetsTouched } = await renderXlsxFill(model, brand, original);
      return { buffer, writeBack: { matched, unmatched: unmatched.length, sheets: sheetsTouched } };
    }
    return { buffer: await renderXlsx(model, brand) };
  },
  docx: async ({ model, brand, summary, logo }) => ({ buffer: await renderDocx(model, brand, summary, logo) }),
  pptx: null,
};

export { resolveLogo, type LogoAsset } from "./logo";
