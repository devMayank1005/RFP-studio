
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { rfpDocuments, rfps } from "@/db/schema";
import type { DocumentKind, ParseStatus } from "@/domain/enums";
import { isUuid } from "@/domain/ids";

export interface DocumentRow {
  id: string;
  rfpId: string;
  kind: DocumentKind;
  fileName: string;
  fileUrl: string;
  mime: string;
  sizeBytes: number;
  pageCount: number | null;
  parseStatus: ParseStatus;
  parsedTextUrl: string | null;
  parseError: string | null;
  createdAt: Date;
}

const columns = {
  id: rfpDocuments.id,
  rfpId: rfpDocuments.rfpId,
  kind: rfpDocuments.kind,
  fileName: rfpDocuments.fileName,
  fileUrl: rfpDocuments.fileUrl,
  mime: rfpDocuments.mime,
  sizeBytes: rfpDocuments.sizeBytes,
  pageCount: rfpDocuments.pageCount,
  parseStatus: rfpDocuments.parseStatus,
  parsedTextUrl: rfpDocuments.parsedTextUrl,
  parseError: rfpDocuments.parseError,
  createdAt: rfpDocuments.createdAt,
};

/** Every document on an RFP, oldest first, scoped to the workspace. Empty when the RFP is not ours. */
export async function listDocuments(workspaceId: string, rfpId: string): Promise<DocumentRow[]> {
  if (!isUuid(rfpId)) return [];
  return db
    .select(columns)
    .from(rfpDocuments)
    .innerJoin(rfps, eq(rfpDocuments.rfpId, rfps.id))
    .where(and(eq(rfpDocuments.rfpId, rfpId), eq(rfps.workspaceId, workspaceId)))
    .orderBy(asc(rfpDocuments.createdAt));
}

/** Unscoped read for background jobs, which run with no session. */
export async function getDocumentForJob(documentId: string): Promise<DocumentRow | null> {
  const [row] = await db.select(columns).from(rfpDocuments).where(eq(rfpDocuments.id, documentId)).limit(1);
  return row ?? null;
}

/** Unscoped list for background jobs, oldest first — the same caveat as `getDocumentForJob`. */
export async function listDocumentsForJob(rfpId: string): Promise<DocumentRow[]> {
  return db.select(columns).from(rfpDocuments).where(eq(rfpDocuments.rfpId, rfpId)).orderBy(asc(rfpDocuments.createdAt));
}
