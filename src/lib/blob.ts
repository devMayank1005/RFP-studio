
import { del, get, list, put } from "@vercel/blob";

import { StorageUnavailableError, describeStorageFailure } from "@/domain/storage";
import { reportError } from "@/lib/report";

/**
 * Vercel Blob, private access only — RFPs are client-confidential. Nothing
 * here is ever served to the browser directly; the app reads blobs
 * server-side and streams what it must.
 *
 * Every SDK call goes through `withStorage`: a suspended store or a bad token
 * becomes a StorageUnavailableError with a sentence the form can show, and
 * the original error is logged with the pathname. Before this, a suspended
 * store surfaced as the crash screen with a digest and nothing else.
 */

async function withStorage<T>(pathname: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const description = err instanceof Error ? describeStorageFailure(err) : null;
    if (!description) throw err;
    reportError(err, { where: "storage", pathname });
    throw new StorageUnavailableError(description, { cause: err });
  }
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

/**
 * Put a blob with private access and a random suffix, so two uploads of the same name never collide.
 * @returns The blob's URL and pathname.
 * @sideEffects Writes to Vercel Blob.
 */
export async function uploadPrivate(pathname: string, body: Blob | Buffer | ArrayBuffer | string, contentType?: string) {
  const result = await withStorage(pathname, () =>
    put(pathname, body, {
      access: "private",
      addRandomSuffix: true,
      ...(contentType ? { contentType } : {}),
    }),
  );
  return { url: result.url, pathname: result.pathname };
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

/**
 * Read a private blob into memory, bypassing the cache so a just-written file is seen.
 * @throws {Error} When the blob is missing or not readable.
 */
export async function readPrivate(url: string): Promise<Buffer> {
  const result = await withStorage(url, () => get(url, { access: "private", useCache: false }));
  if (!result || result.statusCode !== 200) throw new Error(`blob not readable: ${url}`);
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

/**
 * Store a value as a private JSON blob.
 * @sideEffects Writes to Vercel Blob.
 */
export async function putJson(pathname: string, value: unknown) {
  return uploadPrivate(pathname, JSON.stringify(value), "application/json");
}

/**
 * Read and parse a private JSON blob. The type parameter is trusted, not checked.
 * @throws {Error} When the blob is missing; `SyntaxError` when it is not JSON.
 */
export async function getJson<T>(url: string): Promise<T> {
  const buffer = await readPrivate(url);
  return JSON.parse(buffer.toString("utf8")) as T;
}

/**
 * Delete blobs by URL; a no-op for an empty list.
 * @sideEffects Deletes from Vercel Blob.
 */
export async function deletePrivate(urls: string[]) {
  await withStorage(urls[0] ?? "(none)", async () => {
    if (urls.length) await del(urls);
  });
}

/** Where a built export lives: `rfps/{rfpId}/exports/{file}` (private, like everything else here). */
export function rfpExportPath(rfpId: string, fileName: string): string {
  return `rfps/${rfpId}/exports/${safeName(fileName)}`;
}

/** One page of a private listing under a prefix; the sweeper walks the cursor. */
export async function listPrivate(prefix: string, cursor?: string) {
  return withStorage(prefix, () => list({ prefix, cursor, limit: 1000 }));
}
