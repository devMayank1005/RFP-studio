import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";

import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { authErrors } from "@/db/schema";
import { isAllowedEmailDomain, parseAllowedDomains } from "@/domain/access";
import { readEnv, readSecret, requireEnv } from "@/lib/env";
import { redactSecrets } from "@/lib/redact";

/**
 * Better Auth owns identity and membership: users, sessions, organisations
 * (= workspaces) and roles, all in our own Neon database. No user record
 * leaves the estate.
 *
 * Microsoft Entra SSO only — there is deliberately no email/password path, so
 * there is no password to leak and no shared dev login. Local verification and
 * E2E tests create a session row directly (scripts/dev-session.mjs) rather
 * than signing in, so no bypass exists in app code.
 *
 * Redirect URI to register in the Entra app:
 *   {BETTER_AUTH_URL}/api/auth/callback/microsoft
 *
 * ACCESS is two independent layers:
 *   1. MICROSOFT_TENANT_ID pins sign-in to the Kognoz Entra directory.
 *   2. ALLOWED_EMAIL_DOMAINS additionally excludes tenant GUESTS, who keep
 *      their own address and would otherwise see every client's RFP.
 * Membership itself is granted just-in-time in src/lib/session.ts.
 *
 * BUILT ON FIRST USE, not at import. `next build` evaluates every route module
 * while "collecting page data", with whatever env the build happens to have,
 * and the first Vercel build died right there on the allowlist check. A
 * deployment without the SSO variables must still build; what it must not do
 * is serve a sign-in. So every check below runs — and throws with the same
 * message — on the first request that needs auth instead of at import.
 */
type Auth = ReturnType<typeof createAuth>;

export type Session = Auth["$Infer"]["Session"];

let instance: Auth | undefined;

/** The Better Auth instance, constructed once per process on first use. */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

/**
 * The tenant is interpolated straight into Microsoft's endpoint URLs, and a
 * malformed value does not fail loudly — a trailing newline in Vercel once
 * produced `.../{tenant}%0A/oauth2/v2.0/token`, which Microsoft refuses before
 * Entra sees the request. It surfaced only as a sign-in redirect loop. So the
 * shape is validated here, where the error can say what is wrong.
 */
const TENANT_ALIASES = new Set(["common", "organizations", "consumers"]);
const TENANT_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SSO_HINT = "Microsoft SSO is the only sign-in path.";

function createAuth() {
  const allowedDomains = parseAllowedDomains(readEnv("ALLOWED_EMAIL_DOMAINS"));

  if (allowedDomains.length === 0) {
    throw new Error(
      "ALLOWED_EMAIL_DOMAINS is not set. Refusing to start with an empty allowlist — " +
        "set it to e.g. kognozconsulting.com.",
    );
  }

  const tenantId = readEnv("MICROSOFT_TENANT_ID") ?? "common";

  if (!TENANT_GUID.test(tenantId) && !TENANT_ALIASES.has(tenantId.toLowerCase())) {
    throw new Error(
      "MICROSOFT_TENANT_ID must be a tenant GUID or one of common/organizations/consumers. " +
        "It goes into Microsoft's endpoint URLs, so a malformed value fails as an unexplained " +
        "sign-in loop rather than as an error.",
    );
  }

  const clientId = requireEnv("MICROSOFT_CLIENT_ID", SSO_HINT);
  // readSecret, not requireEnv: the secret goes into the token request, and a
  // multi-line paste would fail as AADSTS7000215 with nothing pointing at why.
  const clientSecret = readSecret("MICROSOFT_CLIENT_SECRET");
  if (!clientSecret) throw new Error(`MICROSOFT_CLIENT_SECRET is not set. ${SSO_HINT}`);

  const baseURL = readEnv("BETTER_AUTH_URL");

  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    baseURL,
    // Only the site itself may drive the auth endpoints; anything else is a
    // cross-site request and is refused.
    trustedOrigins: baseURL ? [baseURL] : [],

    /**
     * Better Auth's own limiter, but in the database: the default in-memory
     * store is per instance, which on Fluid compute means per nothing. Sign-in
     * is the endpoint worth guarding — a burst there is either a bot or a loop.
     */
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/social": { window: 60, max: 10 },
        "/callback/*": { window: 60, max: 20 },
      },
    },

    socialProviders: {
      microsoft: {
        clientId,
        clientSecret,
        // "common" accepts any Entra tenant. MICROSOFT_TENANT_ID locks sign-in
        // to the Kognoz tenant.
        tenantId,
      },
    },

    user: {
      /**
       * Refuse a disallowed address at the auth layer, before any row is
       * written. Bouncing later would leave orphaned user records behind for
       * every guest who ever tried.
       */
      validateUserInfo: ({ user }) => {
        if (isAllowedEmailDomain(user.email, allowedDomains)) return;
        return {
          error: "domain_not_allowed",
          errorDescription: `RFP Studio is limited to ${allowedDomains.join(", ")} accounts.`,
        };
      },
    },

    onAPIError: {
      /**
       * Record why a sign-in failed. Without this the browser shows only
       * "internal_server_error" and the cause is invisible unless someone is
       * watching the server log at the moment it happens.
       */
      onError: async (error, ctx) => {
        const e = error as {
          message?: string;
          body?: { code?: string; message?: string };
          status?: number;
          path?: string;
        };
        const path = e?.path ?? (ctx as unknown as { path?: string })?.path ?? null;
        try {
          await db.insert(authErrors).values({
            path,
            code: e?.body?.code ?? (e?.status ? String(e.status) : null),
            message: redactSecrets(e?.body?.message ?? e?.message ?? String(error)),
          });
        } catch {
          // Diagnostics must never take down the request they are describing.
        }
        console.error("[auth]", path, e?.body?.code ?? e?.status, e?.body?.message ?? e?.message);
      },
    },

    plugins: [
      organization({
        // One workspace (Kognoz), seeded. Nobody creates workspaces from the UI.
        allowUserToCreateOrganization: false,
      }),
    ],

    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // With SSO-only sign-in, disabling someone in Entra is the only
      // offboarding lever there is; a hard 7-day cap bounds that window.
      disableSessionRefresh: true,
    },
  });
}
