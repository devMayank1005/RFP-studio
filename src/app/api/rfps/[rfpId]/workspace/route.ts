import { NextResponse } from "next/server";

import { withOrg } from "@/db/client";
import { getWorkspaceRows } from "@/db/queries/workspace";
import { apiBudget } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";

/** The grid's rows, for TanStack Query refetches after a mutation or a finished job. */
export async function GET(_request: Request, ctx: RouteContext<"/api/rfps/[rfpId]/workspace">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const limited = await apiBudget(session, "api:session");
  if (limited) return limited;

  const { rfpId } = await ctx.params;
  const data = await withOrg(session.workspaceId, (tx) => getWorkspaceRows(session.workspaceId, rfpId, tx));
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
