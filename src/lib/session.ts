import "server-only";

import { randomUUID } from "node:crypto";

import { cache } from "react";

import { count, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { retryOnConnectionError } from "@/db/retry";
import { auditLog, member, organization } from "@/db/schema";
import { isAllowedEmailDomain, parseAllowedDomains } from "@/domain/access";
import type { Role } from "@/domain/enums";
import { auth } from "@/lib/auth";
import { readEnv } from "@/lib/env";

/** Role granted on first sign-in to someone from an allowed domain. */
const DEFAULT_ROLE: Role = "consultant";

/** The workspace new members join. */
const DEFAULT_WORKSPACE_SLUG = readEnv("DEFAULT_WORKSPACE_SLUG") ?? "kognoz";

export interface AppSession {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  workspaceId: string;
  workspaceName: string;
  role: Role;
}

/**
 * Is the browser presenting a session cookie at all?
 *
 * Used only to tell "signed out" apart from "database unreachable" — never as
 * authentication. proxy.ts does the same presence check for cheap redirects.
 */
function hasSessionCookie(h: Headers): boolean {
  return /(^|;\s*)(__Secure-)?better-auth\.session_token=/.test(h.get("cookie") ?? "");
}

type SessionResult =
  | { ok: true; session: AppSession }
  | { ok: false; reason: "signed-out" | "no-access" };

/**
 * The authoritative session check.
 *
 * `proxy.ts` only looks for a cookie so signed-out visitors bounce cheaply;
 * this validates the session and resolves which workspace and role the
 * request runs as. The workspaceId it returns is what every query filters on.
 *
 * Wrapped in React `cache()` so it runs once per request: the app layout and
 * the page beneath it both call it.
 *
 * It also PROVISIONS membership just in time: anyone from an allowed domain
 * gets the workspace on first sign-in, with no admin step. Done here rather
 * than in a user-creation hook because that hook fires only for new users and
 * would never repair an account that already exists without a membership.
 */
const resolveSession = cache(async function resolveSession(): Promise<SessionResult> {
  const requestHeaders = await headers();
  const session = await retryOnConnectionError(() => auth.api.getSession({ headers: requestHeaders }));

  if (!session?.user) {
    /**
     * A cookie with no session means one of two very different things: the
     * session really has gone, or the database could not be reached. Better
     * Auth returns null for BOTH. Signing someone out because Neon was slow is
     * the wrong answer, so when a cookie is present, prove the database is
     * reachable first; if it is not, this throws and the error boundary says
     * so with a retry.
     */
    if (hasSessionCookie(requestHeaders)) await db.execute(sql`select 1`);
    return { ok: false, reason: "signed-out" };
  }

  const userId = session.user.id;
  const existing = await retryOnConnectionError(() =>
    db
      .select({ workspaceId: member.organizationId, role: member.role, workspaceName: organization.name })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, userId))
      .limit(1),
  );

  const membership = existing[0] ?? (await provisionMembership(session.user));
  // Signed in with a real Microsoft account but no workspace — a different
  // answer from "not signed in", and it must keep its own destination.
  if (!membership) return { ok: false, reason: "no-access" };

  return {
    ok: true,
    session: {
      userId,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image ?? null,
      workspaceId: membership.workspaceId,
      workspaceName: membership.workspaceName,
      role: (membership.role as Role) ?? "reviewer",
    },
  };
});

/** The session, or null when nobody is signed in. For Route Handlers (answer 401, never redirect). */
export async function getSession(): Promise<AppSession | null> {
  const result = await resolveSession();
  return result.ok ? result.session : null;
}

/**
 * As `getSession`, but redirects instead of returning null. For pages and
 * server actions only — a Route Handler must not redirect (the client would
 * parse the sign-in page's HTML as its response).
 */
export async function requireSession(): Promise<AppSession> {
  const result = await resolveSession();
  if (!result.ok) redirect(result.reason === "no-access" ? "/no-access" : "/sign-in");
  return result.session;
}

interface Membership {
  workspaceId: string;
  workspaceName: string;
  role: string;
}

/**
 * Grant the workspace to someone from an allowed domain.
 *
 * The first person to join an empty workspace becomes admin — someone has to
 * be, and there is no other bootstrap path with SSO-only sign-in. Everyone
 * after that is a consultant until an admin changes it.
 *
 * Returns null — meaning /no-access — when the address is not allowed (a
 * tenant guest) or when the target workspace cannot be identified
 * unambiguously. Guessing would be worse than refusing.
 */
async function provisionMembership(user: { id: string; email: string }): Promise<Membership | null> {
  const allowedDomains = parseAllowedDomains(readEnv("ALLOWED_EMAIL_DOMAINS"));
  if (!isAllowedEmailDomain(user.email, allowedDomains)) return null;

  const workspace = await resolveDefaultWorkspace();
  if (!workspace) {
    console.error("[session] no workspace to provision into — is the seed run?");
    return null;
  }

  const [{ members }] = await db
    .select({ members: count() })
    .from(member)
    .where(eq(member.organizationId, workspace.id));
  const role: Role = members === 0 ? "admin" : DEFAULT_ROLE;

  await db.insert(member).values({
    id: randomUUID(),
    organizationId: workspace.id,
    userId: user.id,
    role,
    createdAt: new Date(),
  });

  await db.insert(auditLog).values({
    workspaceId: workspace.id,
    actorId: user.id,
    entity: "member",
    entityId: user.id,
    action: "member.added",
    diff: { email: user.email, role, reason: members === 0 ? "first member" : "allowed email domain" },
  });

  return { workspaceId: workspace.id, workspaceName: workspace.name, role };
}

async function resolveDefaultWorkspace(): Promise<{ id: string; name: string } | null> {
  const bySlug = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.slug, DEFAULT_WORKSPACE_SLUG))
    .limit(1);
  if (bySlug[0]) return bySlug[0];

  const all = await db.select({ id: organization.id, name: organization.name }).from(organization).limit(2);
  return all.length === 1 ? all[0] : null;
}
