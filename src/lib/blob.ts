
import { del, get, put } from "@vercel/blob";

/**
 * Vercel Blob, private access only — RFPs are client-confidential. Nothing
 * here is ever served to the browser directly; the app reads blobs
 * server-side and streams what it must.
 */

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

export async function uploadPrivate(pathname: string, body: Blob | Buffer | ArrayBuffer | string, contentType?: string) {
  const result = await put(pathname, body, {
    access: "private",
    addRandomSuffix: true,
    ...(contentType ? { contentType } : {}),
  });
  return { url: result.url, pathname: result.pathname };
}

export function rfpUploadPath(rfpId: string, fileName: string): string {
  return `rfps/${rfpId}/uploads/${safeName(fileName)}`;
}

export function rfpParsedPath(rfpId: string, documentId: string): string {
  return `rfps/${rfpId}/parsed/${documentId}.json`;
}

export async function readPrivate(url: string): Promise<Buffer> {
  const result = await get(url, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) throw new Error(`blob not readable: ${url}`);
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

export async function putJson(pathname: string, value: unknown) {
  return uploadPrivate(pathname, JSON.stringify(value), "application/json");
}

export async function getJson<T>(url: string): Promise<T> {
  const buffer = await readPrivate(url);
  return JSON.parse(buffer.toString("utf8")) as T;
}

export async function deletePrivate(urls: string[]) {
  if (urls.length) await del(urls);
}
