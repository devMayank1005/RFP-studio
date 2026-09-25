import "server-only";

import { and, eq } from "drizzle-orm";
import type { ZodType } from "zod";

import { db } from "@/db/client";
import { rfps } from "@/db/schema";
import { can, type Action } from "@/domain/access";
import { StorageUnavailableError } from "@/domain/storage";
import { reportError } from "@/lib/report";
import { requireSession, type AppSession } from "@/lib/session";

/**
 * The shape every server action returns: never a thrown error for an
 * expected failure. The UI branches on `ok` and shows `error` as a toast or
 * `fieldErrors` inline.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** A successful result carrying `data`. */
export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

/** A failed result: `error` for the toast, `fieldErrors` for the inline messages. */
export function fail<T = undefined>(error: string, fieldErrors?: Record<string, string[]>): ActionResult<T> {
  return { ok: false, error, fieldErrors };
}

/** Thrown inside an action body for an expected failure; `runAction` turns it into a `fail` result instead of a 500. */
export class ActionError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

/** Parse with zod, turning issues into field errors the form can show. */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  throw new ActionError("Please fix the highlighted fields.", fieldErrors);
}

/** Session + permission in one call; throws ActionError when the role may not act. */
export async function requireCan(action: Action): Promise<AppSession> {
  const session = await requireSession();
  if (!can(session.role, action)) throw new ActionError(`Your role (${session.role}) cannot ${action.replace(".", " ")}.`);
  return session;
}

/** The RFP, only if it belongs to the session's workspace. */
export async function requireRfp(session: AppSession, rfpId: string) {
  const [rfp] = await db
    .select()
    .from(rfps)
    .where(and(eq(rfps.id, rfpId), eq(rfps.workspaceId, session.workspaceId)))
    .limit(1);
  if (!rfp) throw new ActionError("That RFP is not in your workspace.");
  return rfp;
}

/** Runs an action body and maps ActionError to a result; anything else is a real bug and rethrows. */
export async function runAction<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await body());
  } catch (err) {
    if (err instanceof ActionError) return fail(err.message, err.fieldErrors);
    // Storage helpers already logged the cause; the message is written for the form.
    if (err instanceof StorageUnavailableError) return fail(err.message);
    reportError(err, { where: "action" });
    throw err;
  }
}
