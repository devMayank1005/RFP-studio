import { NextResponse } from "next/server";

import { getExport } from "@/db/queries/exports";
import { contentDisposition, EXPORT_FORMAT_META } from "@/domain/export";
import { readPrivate } from "@/lib/blob";
import { getSession } from "@/lib/session";

/**
 * A finished export, streamed from the private store. Session-gated and
 * workspace-scoped; a Route Handler answers 401, never redirects. Files are
 * a few hundred kilobytes — far under the 4.5 MB a Vercel function may
 * return — so the whole body goes in one response.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/rfps/[rfpId]/exports/[exportId]/download">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { rfpId, exportId } = await ctx.params;
  const row = await getExport(session.workspaceId, exportId);
  if (!row || row.rfpId !== rfpId || row.status !== "done" || !row.fileUrl) return NextResponse.json({ error: "not found" }, { status: 404 });

  const bytes = await readPrivate(row.fileUrl);
  const meta = EXPORT_FORMAT_META[row.format];
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": meta.contentType,
      "content-disposition": contentDisposition(row.fileName ?? `export.${meta.extension}`),
      "content-length": String(bytes.byteLength),
      "cache-control": "no-store, private",
    },
  });
}
