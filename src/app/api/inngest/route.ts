import { serve } from "inngest/next";
import { NextResponse, type NextRequest } from "next/server";

import { inngest, inngestServeError } from "@/inngest/client";
import { functions } from "@/inngest/functions";

/**
 * Inngest's endpoint. Locally `pnpm inngest:dev` discovers it; in production
 * the app registers itself with `curl -X PUT https://<host>/api/inngest`
 * after the keys are set (see README).
 *
 * Fails closed: in cloud mode without a signing key the SDK cannot verify
 * requests, so the route answers 503 instead of running anything. Checked per
 * request, not at import — `next build` evaluates this module without the
 * production env.
 */
const handlers = serve({ client: inngest, functions });

type Handler = (request: NextRequest, ctx: RouteContext<"/api/inngest">) => Promise<Response>;

function guarded(handler: Handler): Handler {
  return async (request, ctx) => {
    const error = inngestServeError();
    if (error) return NextResponse.json({ error }, { status: 503 });
    return handler(request, ctx);
  };
}

export const GET = guarded(handlers.GET as unknown as Handler);
export const POST = guarded(handlers.POST as unknown as Handler);
export const PUT = guarded(handlers.PUT as unknown as Handler);
