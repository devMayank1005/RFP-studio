import { NonRetriableError } from "inngest";

import { writeAudit } from "@/db/audit";
import { db, withOrg } from "@/db/client";
import { bumpJobProgress, finishJob, markJobRunning, setJobProgress } from "@/db/jobs";
import { getActiveBrand } from "@/db/queries/brand";
import { finishExportRow, getExportSource, markExportRunning, pickWorkbook } from "@/db/queries/exports";
import { todayInKolkata } from "@/domain/dates";
import { ENGAGEMENT_TYPE_LABEL } from "@/domain/enums";
import { buildExportModel, EXPORT_FORMAT_META, exportFileName, type ExportBrand, type ExportSheet } from "@/domain/export";
import { flattenSummary, type SummaryInput } from "@/domain/summary";
import { engineConfigError } from "@/engine/client";
import { generateExecutiveSummary } from "@/engine/summary";
import { readPrivate, rfpExportPath, uploadPrivate } from "@/lib/blob";
import { renderers, resolveLogo } from "@/lib/export";

import { exportRequested, inngest } from "./client";
import { loadParsed } from "./parse";

/**
 * Build one export file. Four durable steps for Word (the executive summary
 * is a model call), three for Excel. Rendering and uploading happen in one
 * step and only the blob URL crosses the step boundary — Inngest memoises
 * step results as JSON and a file must never travel that way.
 */
export const buildExport = inngest.createFunction(
  {
    id: "build-export",
    retries: 1,
    // A re-delivered event for the same job never starts a second run.
    idempotency: "event.data.jobId",
    // Per-workspace fairness first, then a global ceiling.
    concurrency: [
      { limit: 2, key: "event.data.workspaceId" },
      { limit: 4 },
    ],
    triggers: [exportRequested],
    onFailure: async ({ event, error }) => {
      const { jobId, exportId } = event.data.event.data;
      await finishJob(jobId, "failed", error.message);
      await finishExportRow(exportId, { status: "failed", error: error.message });
    },
  },
  async ({ event, step, runId }) => {
    const { rfpId, workspaceId, exportId, jobId, format, actorId } = event.data;
    const loadSource = () => withOrg(workspaceId, (tx) => getExportSource(rfpId, tx));
    const options = event.data.options ?? {};
    const meta = EXPORT_FORMAT_META[format];

    const prep = await step.run("prepare", async () => {
      await markJobRunning(jobId, runId);
      await markExportRunning(exportId);
      await setJobProgress(jobId, 0, meta.steps);
      if (!renderers[format]) throw new NonRetriableError(`The ${meta.label} export is not available yet.`);
      const source = await loadSource();
      if (!source) throw new NonRetriableError("rfp not found");
      const brand = await getActiveBrand(source.workspaceId);
      const exportBrand: ExportBrand = {
        name: brand.name,
        primaryColor: brand.primaryColor,
        accentColor: brand.accentColor,
        successColor: brand.successColor,
        fontFamily: brand.fontFamily,
        footerText: brand.footerText ?? null,
        logoUrl: brand.logoUrl ?? null,
      };
      await bumpJobProgress(jobId);
      return { workspaceId: source.workspaceId, brand: exportBrand, voiceGuide: brand.voiceGuide };
    });

    const summarised = meta.needsEngine
      ? await step.run("summarise", async () => {
          if (engineConfigError) throw new NonRetriableError(engineConfigError);
          const source = await loadSource();
          if (!source) throw new NonRetriableError("rfp not found");
          const model = buildExportModel({ ...source, sheets: [], generatedAt: new Date().toISOString() }, options);
          const input: SummaryInput = {
            clientName: source.client.name,
            clientProfile: { industry: source.client.industry, hqCountry: source.client.hqCountry, headcount: source.client.headcount, currentHrms: source.client.currentHrms },
            rfpTitle: source.rfp.title,
            engagementType: ENGAGEMENT_TYPE_LABEL[source.rfp.engagementType],
            contextSummary: source.rfp.contextSummary,
            sectionTitles: model.sections.map((s) => s.title),
            approved: model.questions
              .filter((q) => q.answer?.status === "approved" && q.answer.text)
              .map((q) => ({ refNo: q.refNo, questionText: q.questionText, answerText: q.answer!.text, compliance: q.answer!.compliance })),
            counts: { total: model.readiness.total, approved: model.readiness.approved, ...model.complianceCounts },
          };
          const result = await generateExecutiveSummary({ ...input, voiceGuide: prep.voiceGuide });
          await bumpJobProgress(jobId);
          return { summary: result.summary, model: result.model, promptVersion: result.promptVersion, usage: result.usage };
        })
      : null;

    const built = await step.run("render-and-upload", async () => {
      const source = await loadSource();
      if (!source) throw new NonRetriableError("rfp not found");
      const parsed = await Promise.all(
        source.documents.filter((d) => d.parsedTextUrl).map(async (d) => ({ documentId: d.id, doc: await loadParsed(d.parsedTextUrl!) })),
      );
      const sheets: ExportSheet[] = parsed.flatMap(({ documentId, doc }) => (doc.sheets ?? []).map((s) => ({ documentId, name: s.name, headerRow: s.headerRow, headers: s.headers, rows: s.rows })));
      const model = buildExportModel({ ...source, sheets, generatedAt: new Date().toISOString() }, options);

      const workbook = format === "xlsx" && model.options.shape === "fill" ? pickWorkbook(source.documents) : null;
      if (format === "xlsx" && model.options.shape === "fill" && !workbook) {
        throw new NonRetriableError("The client's spreadsheet is not available for this RFP any more — build a fresh workbook instead.");
      }
      const original = workbook ? await readPrivate(workbook.fileUrl) : null;
      const logo = format === "docx" ? await resolveLogo(prep.brand.logoUrl) : null;
      const fileName = exportFileName({ clientName: source.client.name, rfpTitle: source.rfp.title, format, date: todayInKolkata(), shape: model.options.shape, originalName: workbook?.fileName ?? null });

      const out = await renderers[format]!({ model, brand: prep.brand, summary: summarised?.summary ?? null, logo, original });
      const { url } = await uploadPrivate(rfpExportPath(rfpId, fileName), out.buffer, meta.contentType);
      await bumpJobProgress(jobId);
      return { url, fileName, sizeBytes: out.buffer.byteLength, questions: model.questions.length, approved: model.readiness.approved, unapproved: model.readiness.unapproved, writeBack: out.writeBack ?? null };
    });

    await step.run("finish", async () => {
      await finishExportRow(exportId, { status: "done", fileUrl: built.url, fileName: built.fileName, sizeBytes: built.sizeBytes, summary: summarised ? flattenSummary(summarised.summary) : null });
      await writeAudit(db, {
        workspaceId: prep.workspaceId,
        actorId,
        entity: "export",
        entityId: exportId,
        action: "export.built",
        diff: {
          format,
          options,
          fileName: built.fileName,
          sizeBytes: built.sizeBytes,
          questions: built.questions,
          approved: built.approved,
          unapproved: built.unapproved,
          writeBack: built.writeBack,
          ...(summarised ? { model: summarised.model, promptVersion: summarised.promptVersion, usage: { inputTokens: summarised.usage.inputTokens, outputTokens: summarised.usage.outputTokens } } : {}),
        },
      });
      await bumpJobProgress(jobId);
      await finishJob(jobId, "done");
    });

    return { fileName: built.fileName, sizeBytes: built.sizeBytes };
  },
);
