/**
 * Dev harness: attach a local file to an RFP exactly as the upload action
 * does (private Blob → rfp_documents row → parse job → Inngest event),
 * without a browser. Useful for driving the pipeline from the shell.
 *
 *   pnpm exec tsx scripts/simulate-upload.ts <rfpId> <file> [kind]
 *
 * Requires the dev server and `pnpm inngest:dev` to be running so the
 * parse job actually executes.
 */
import "@/lib/load-env";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { createJob } from "@/db/jobs";
import { rfpDocuments, rfps } from "@/db/schema";
import { DOCUMENT_KINDS, type DocumentKind } from "@/domain/enums";
import { documentUploaded, inngest } from "@/inngest/client";
import { rfpUploadPath, uploadPrivate } from "@/lib/blob";
import { detectKind } from "@/lib/parsing";

const MIME: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

async function main() {
  const [rfpId, file, kindArg] = process.argv.slice(2);
  if (!rfpId || !file) {
    console.error("usage: tsx scripts/simulate-upload.ts <rfpId> <file> [kind]");
    process.exit(1);
  }
  const kind = (DOCUMENT_KINDS as readonly string[]).includes(kindArg ?? "") ? (kindArg as DocumentKind) : "rfp_main";
  const fileName = path.basename(file);
  const detected = detectKind(fileName);
  if (!detected) throw new Error(`unsupported file: ${fileName}`);

  const [rfp] = await db.select({ id: rfps.id, status: rfps.status, workspaceId: rfps.workspaceId }).from(rfps).where(eq(rfps.id, rfpId)).limit(1);
  if (!rfp) throw new Error(`rfp ${rfpId} not found`);

  const buffer = await readFile(file);
  const { url } = await uploadPrivate(rfpUploadPath(rfpId, fileName), buffer, MIME[detected]);
  const [doc] = await db
    .insert(rfpDocuments)
    .values({ rfpId, kind, fileName, fileUrl: url, mime: MIME[detected], sizeBytes: buffer.byteLength })
    .returning({ id: rfpDocuments.id });
  const jobId = await createJob({ rfpId, jobType: "parse", dedupeKey: `parse:${doc.id}`, payload: { documentId: doc.id, fileName, via: "simulate-upload" }, progressTotal: 1 });
  if (!jobId) throw new Error("a parse job for this document is already live");
  await inngest.send(documentUploaded.create({ rfpId, workspaceId: rfp.workspaceId, documentId: doc.id, jobId }));
  if (rfp.status === "draft") await db.update(rfps).set({ status: "parsing" }).where(eq(rfps.id, rfpId));

  console.log(`[upload] ${fileName} (${kind}) → document ${doc.id}, job ${jobId}, event sent`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
