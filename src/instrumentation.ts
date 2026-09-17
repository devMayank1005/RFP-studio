import type { Instrumentation } from "next";

import { reportError } from "@/lib/report";

/**
 * Next's server-side error hook: every throw a page, route handler or server
 * action surfaces as a digest also lands here, with the route that produced
 * it. The report is one redacted JSON line (see src/lib/report.ts).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  reportError(err, {
    where: "request",
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};

export async function register(): Promise<void> {
  // Nothing to set up; the hook above is the point of this file.
}
