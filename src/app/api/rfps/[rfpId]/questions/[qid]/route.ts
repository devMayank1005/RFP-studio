import { NextResponse } from "next/server";

import { getQuestionDetail } from "@/db/queries/workspace";
import { getSession } from "@/lib/session";

/** The context panel's detail: response, revisions, citations. Fetched on selection, prefetched for neighbours. */
export async function GET(_request: Request, ctx: RouteContext<"/api/rfps/[rfpId]/questions/[qid]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { rfpId, qid } = await ctx.params;
  const detail = await getQuestionDetail(session.workspaceId, rfpId, qid);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(detail, { headers: { "cache-control": "no-store" } });
}
