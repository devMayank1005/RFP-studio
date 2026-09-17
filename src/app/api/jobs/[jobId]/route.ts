import { NextResponse } from "next/server";

import { withOrg } from "@/db/client";
import { getJob } from "@/db/jobs";
import { getSession } from "@/lib/session";

/** Progress for one job. Polled by the wizard and the workspace; a Route Handler answers 401, never redirects. */
export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[jobId]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { jobId } = await ctx.params;
  const job = await withOrg(session.workspaceId, (tx) => getJob(session.workspaceId, jobId, tx));
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(job, { headers: { "cache-control": "no-store" } });
}
