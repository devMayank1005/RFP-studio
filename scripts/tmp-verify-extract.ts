/**
 * TEMPORARY verification harness for the per-chunk extract job (not committed).
 * Creates a draft RFP, attaches the Vedanta fixture, waits for the parse job,
 * starts extraction exactly as startExtraction does, and polls the job row,
 * asserting done <= total on every sample.
 */
import "@/lib/load-env";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { createJob } from "@/db/jobs";
import { generationJobs, rfpDocuments, rfpQuestions, rfpSections, rfps } from "@/db/schema";
import { documentUploaded, extractRequested, inngest } from "@/inngest/client";
import { rfpUploadPath, uploadPrivate } from "@/lib/blob";

const SOURCE_RFP = "1b30f112-f9f2-4748-b416-7c505f59c6f6";
const FILE = "fixtures/private/vedanta-hr-transformation.xlsx";
const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function job(id: string) {
  const [j] = await db.select().from(generationJobs).where(eq(generationJobs.id, id)).limit(1);
  return j;
}

async function main() {
  const [src] = await db.select({ workspaceId: rfps.workspaceId, clientId: rfps.clientId, createdBy: rfps.createdBy }).from(rfps).where(eq(rfps.id, SOURCE_RFP)).limit(1);
  if (!src) throw new Error("source rfp missing");
  const [rfp] = await db.insert(rfps).values({ workspaceId: src.workspaceId, clientId: src.clientId, title: "Chunk-step verification (tmp)", createdBy: src.createdBy }).returning({ id: rfps.id });
  console.log("rfp", rfp.id);

  const fileName = path.basename(FILE);
  const buffer = await readFile(FILE);
  const { url } = await uploadPrivate(rfpUploadPath(rfp.id, fileName), buffer, MIME);
  const [doc] = await db.insert(rfpDocuments).values({ rfpId: rfp.id, kind: "rfp_main", fileName, fileUrl: url, mime: MIME, sizeBytes: buffer.byteLength }).returning({ id: rfpDocuments.id });
  const parseJobId = await createJob({ rfpId: rfp.id, jobType: "parse", dedupeKey: `parse:${doc.id}`, payload: { documentId: doc.id, fileName }, progressTotal: 1 });
  if (!parseJobId) throw new Error("parse job not created");
  await inngest.send(documentUploaded.create({ rfpId: rfp.id, workspaceId: src.workspaceId, documentId: doc.id, jobId: parseJobId }));
  await db.update(rfps).set({ status: "parsing" }).where(eq(rfps.id, rfp.id));

  for (let i = 0; i < 60; i++) {
    const j = await job(parseJobId);
    if (j.status === "done") break;
    if (j.status === "failed") throw new Error(`parse failed: ${j.error}`);
    await sleep(2000);
  }
  console.log("parsed");

  const parsed = await db.select({ id: rfpDocuments.id }).from(rfpDocuments).where(and(eq(rfpDocuments.rfpId, rfp.id), eq(rfpDocuments.parseStatus, "parsed"), inArray(rfpDocuments.kind, ["rfp_main", "appendix"])));
  const jobId = await createJob({ rfpId: rfp.id, jobType: "extract", dedupeKey: "extract", payload: { documentIds: parsed.map((d) => d.id) }, createdBy: src.createdBy });
  if (!jobId) throw new Error("extract job not created");
  await inngest.send(extractRequested.create({ rfpId: rfp.id, workspaceId: src.workspaceId, jobId }));
  console.log("extract job", jobId);

  const started = Date.now();
  let last = "";
  let overshoot = false;
  for (;;) {
    const j = await job(jobId);
    const line = `${j.status} ${j.progressDone}/${j.progressTotal}`;
    if (line !== last) {
      console.log(`${Math.round((Date.now() - started) / 1000)}s ${line}`);
      last = line;
    }
    if (j.progressTotal > 0 && j.progressDone > j.progressTotal) overshoot = true;
    if (["done", "failed", "cancelled"].includes(j.status)) {
      if (j.error) console.log("error:", j.error);
      break;
    }
    if (Date.now() - started > 20 * 60 * 1000) throw new Error("timed out");
    await sleep(3000);
  }
  console.log("overshoot:", overshoot);

  const [q] = await db.select({ n: sql<number>`count(*)::int` }).from(rfpQuestions).where(eq(rfpQuestions.rfpId, rfp.id));
  const [s] = await db.select({ n: sql<number>`count(*)::int` }).from(rfpSections).where(eq(rfpSections.rfpId, rfp.id));
  const refs = await db.select({ refNo: rfpQuestions.refNo }).from(rfpQuestions).where(eq(rfpQuestions.rfpId, rfp.id)).orderBy(desc(rfpQuestions.sortOrder)).limit(3);
  const [dup] = await db.select({ n: sql<number>`count(*)::int` }).from(rfpQuestions).where(and(eq(rfpQuestions.rfpId, rfp.id), sql`${rfpQuestions.refNo} like '%·%'`));
  console.log(`questions ${q.n}, sections ${s.n}, last refs ${refs.map((r) => r.refNo).join(",")}, suffixed refs ${dup.n}`);
  const [rf] = await db.select({ status: rfps.status, summary: rfps.contextSummary }).from(rfps).where(eq(rfps.id, rfp.id)).limit(1);
  console.log(`rfp status ${rf.status}, brief chars ${rf.summary?.length ?? 0}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
