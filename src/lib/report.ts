import { redactSecrets } from "@/lib/redact";

/**
 * Error reporting without a vendor: one JSON line per event on stdout/stderr.
 * Vercel's log viewer indexes JSON lines, so `level:error` and `where:` become
 * filters (Project → Logs). Every message and stack frame passes through
 * `redactSecrets` — the 2026-09-03 incident (see redact.ts) started with an
 * error message that carried a credential.
 *
 * A Sentry-style client can be added behind these two functions later without
 * touching call sites.
 */

export interface ReportContext {
  /** Where in the app this came from: "action", "request", "job:draft", "sweep"… */
  where: string;
  requestId?: string;
  workspaceId?: string;
  userId?: string;
  rfpId?: string;
  jobId?: string;
  [extra: string]: unknown;
}

const STACK_FRAMES = 8;

/** Report a caught error with its context. Never throws. */
export function reportError(err: unknown, ctx: ReportContext): void {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const digest = (e as { digest?: string }).digest;
    const stack = e.stack
      ?.split("\n")
      .slice(1, STACK_FRAMES + 1)
      .map((line) => redactSecrets(line))
      .join(" | ");
    console.error(
      JSON.stringify({
        level: "error",
        ts: new Date().toISOString(),
        ...ctx,
        name: e.name,
        message: redactSecrets(e.message) ?? "",
        ...(digest ? { digest } : {}),
        ...(stack ? { stack } : {}),
      }),
    );
  } catch {
    // Reporting must never take down what it is describing.
  }
}

/** Report something that happened (a sweep, a reaped job) with a few fields. Never throws. */
export function reportEvent(event: string, fields: Record<string, unknown> = {}): void {
  try {
    console.log(JSON.stringify({ level: "info", ts: new Date().toISOString(), event, ...fields }));
  } catch {
    // ditto
  }
}
