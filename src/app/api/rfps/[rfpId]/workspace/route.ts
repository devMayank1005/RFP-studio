import { NextResponse } from "next/server";

import { getWorkspaceRows } from "@/db/queries/workspace";
import { getSession } from "@/lib/session";

/** The grid's rows, for TanStack Query refetches after a mutation or a finished job. */
export async function GET(_request: Request, ctx: RouteContext<"/api/rfps/[rfpId]/workspace">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { rfpId } = await ctx.params;
  const data = await getWorkspaceRows(session.workspaceId, rfpId);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
