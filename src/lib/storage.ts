import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { StorageUnavailableError, describeStorageFailure, isLegacyBlobUrl, isMissingObjectError, storageKey } from "@/domain/storage";
import { readEnv, readSecret } from "@/lib/env";
import { reportError, reportEvent } from "@/lib/report";

/**
 * File storage: a private bucket on the database's Neon branch, reached over
 * S3 (Neon Object Storage). RFPs are client-confidential, so nothing here is
 * ever served to the browser directly; the app reads objects server-side and
 * streams what it must.
 *
 * A stored handle is the object key (`rfps/{rfpId}/uploads/name-XXXXXXXXXX.xlsx`).
 * Files written before September 2026 are still addressed by their Vercel
 * Blob URL; those go through the Blob SDK until `pnpm storage:migrate` has
 * copied them across (which needs the retired store to be readable).
 *
 * Every call goes through `withStorage`: a bad credential, a missing bucket
 * or a dead store becomes a StorageUnavailableError with a sentence the form
 * can show, and the original error is logged with the key.
 */

const REQUIRED = ["AWS_ENDPOINT_URL_S3", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "STORAGE_BUCKET"] as const;

/** Set when the bucket cannot be configured from env, so an upload can refuse before it starts. */
export function storageConfigError(): string | null {
  const missing = REQUIRED.filter((name) => !(name.endsWith("KEY") || name.endsWith("KEY_ID") ? readSecret(name) : readEnv(name)));
  return missing.length ? `File storage is not configured on this server: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set. See README › Environment.` : null;
}

let client: S3Client | undefined;

function s3(): S3Client {
  if (client) return client;
  const error = storageConfigError();
  if (error) throw new StorageUnavailableError(error);
  client = new S3Client({
    endpoint: readEnv("AWS_ENDPOINT_URL_S3"),
    region: readEnv("AWS_REGION"),
    credentials: { accessKeyId: readSecret("AWS_ACCESS_KEY_ID")!, secretAccessKey: readSecret("AWS_SECRET_ACCESS_KEY")! },
    // Neon Object Storage is addressed as {endpoint}/{bucket}/{key}; virtual-host style does not resolve.
    forcePathStyle: true,
  });
  return client;
}

function bucket(): string {
  return readEnv("STORAGE_BUCKET")!;
}

async function withStorage<T>(handle: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StorageUnavailableError) throw err;
    const description = err instanceof Error ? describeStorageFailure(err) : null;
    if (!description) throw err;
    reportError(err, { where: "storage", pathname: handle });
    throw new StorageUnavailableError(description, { cause: err, missing: isMissingObjectError(err as { name?: string }) });
  }
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

async function toBuffer(body: Blob | Buffer | ArrayBuffer | Uint8Array | string): Promise<Buffer | string> {
  if (typeof body === "string" || Buffer.isBuffer(body)) return body;
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(await body.arrayBuffer());
}

/**
 * Put an object under a randomised key, so two uploads of the same name never collide.
 * @returns The handle to store (`url`) — the object key — and the same key as `pathname`.
 * @sideEffects Writes to the storage bucket.
 */
export async function uploadPrivate(pathname: string, body: Blob | Buffer | ArrayBuffer | string, contentType?: string) {
  const key = storageKey(pathname);
  const payload = await toBuffer(body);
  await withStorage(key, () => s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: payload, ...(contentType ? { ContentType: contentType } : {}) })));
  return { url: key, pathname: key };
}

/** Where an uploaded RFP file lives: `rfps/{rfpId}/uploads/{file}`. */
export function rfpUploadPath(rfpId: string, fileName: string): string {
  return `rfps/${rfpId}/uploads/${safeName(fileName)}`;
}

/** Where an uploaded knowledge-base source lives: `kb/{workspaceId}/sources/{file}`. */
export function kbSourcePath(workspaceId: string, fileName: string): string {
  return `kb/${workspaceId}/sources/${safeName(fileName)}`;
}

/** A Quick Q&A paste, stored as a parsed document so the intake job reads it like a file. */
export function rfpQuickPastePath(rfpId: string): string {
  return `rfps/${rfpId}/parsed/paste.json`;
}

/** Where a document's parsed JSON lives: `rfps/{rfpId}/parsed/{documentId}.json`. */
export function rfpParsedPath(rfpId: string, documentId: string): string {
  return `rfps/${rfpId}/parsed/${documentId}.json`;
}

/** Where a built export lives: `rfps/{rfpId}/exports/{file}` (private, like everything else here). */
export function rfpExportPath(rfpId: string, fileName: string): string {
  return `rfps/${rfpId}/exports/${safeName(fileName)}`;
}

/**
 * Read an object into memory by its handle (a key, or a legacy Vercel Blob URL).
 * @throws {StorageUnavailableError} When the object is missing or storage cannot be reached.
 */
export async function readPrivate(handle: string): Promise<Buffer> {
  if (isLegacyBlobUrl(handle)) {
    return withStorage(handle, async () => {
      const { get } = await import("@vercel/blob");
      const result = await get(handle, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200) throw Object.assign(new Error(`blob not readable: ${handle}`), { name: "BlobNotFoundError" });
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    });
  }
  return withStorage(handle, async () => {
    const out = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: handle }));
    if (!out.Body) throw Object.assign(new Error(`object has no body: ${handle}`), { name: "NoSuchKey" });
    return Buffer.from(await out.Body.transformToByteArray());
  });
}

/**
 * Store a value as a private JSON object.
 * @sideEffects Writes to the storage bucket.
 */
export async function putJson(pathname: string, value: unknown) {
  return uploadPrivate(pathname, JSON.stringify(value), "application/json");
}

/**
 * Read and parse a JSON object. The type parameter is trusted, not checked.
 * @throws {StorageUnavailableError} When the object is missing; `SyntaxError` when it is not JSON.
 */
export async function getJson<T>(handle: string): Promise<T> {
  return JSON.parse((await readPrivate(handle)).toString("utf8")) as T;
}

/**
 * Delete objects by handle. Keys are deleted in batches of 1000. Legacy Blob
 * URLs go to the Blob SDK best-effort: a retired store that cannot be
 * reached is logged, not thrown, because it must never stop a row from
 * being deleted.
 * @sideEffects Deletes from the storage bucket (and the retired Blob store for legacy handles).
 */
export async function deletePrivate(handles: string[]) {
  const legacy = handles.filter(isLegacyBlobUrl);
  const keys = handles.filter((h) => !isLegacyBlobUrl(h));
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await withStorage(batch[0], () => s3().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } })));
  }
  if (legacy.length) {
    try {
      await withStorage(legacy[0], async () => {
        const { del } = await import("@vercel/blob");
        await del(legacy);
      });
    } catch (err) {
      if (!(err instanceof StorageUnavailableError)) throw err;
      reportEvent("storage.legacy_delete_skipped", { count: legacy.length, reason: err.message });
    }
  }
}

/** One page of objects under a prefix, in the shape the sweeper walks: `blobs`, `cursor`, `hasMore`. */
export async function listPrivate(prefix: string, cursor?: string) {
  return withStorage(prefix, async () => {
    const page = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: cursor, MaxKeys: 1000 }));
    return {
      blobs: (page.Contents ?? []).flatMap((o) => (o.Key ? [{ pathname: o.Key, url: o.Key, uploadedAt: o.LastModified ?? new Date(0) }] : [])),
      cursor: page.NextContinuationToken,
      hasMore: page.IsTruncated === true,
    };
  });
}
