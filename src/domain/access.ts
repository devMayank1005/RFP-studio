import type { Role } from "./enums";

/**
 * Who may have a workspace.
 *
 * This is the second of two independent access controls. The first is the
 * Entra tenant lock (MICROSOFT_TENANT_ID), which stops anyone outside the
 * Kognoz directory authenticating at all. This one additionally excludes
 * TENANT GUESTS — people invited into the directory who keep their own address
 * — because a guest invited to a Teams channel should not thereby be able to
 * read every client's RFP.
 *
 * The allowlist is configuration, never a database row: an access control that
 * can be widened from inside the application is a privilege-escalation path.
 */

/**
 * Exact match on the domain, never `endsWith`.
 *
 * `endsWith` would admit `evilkognozconsulting.com`, which anyone can register.
 * Everything here fails closed: a malformed address, a missing address, or an
 * empty allowlist all deny.
 */
export function isAllowedEmailDomain(
  email: string | null | undefined,
  allowedDomains: readonly string[],
): boolean {
  if (allowedDomains.length === 0) return false;

  const address = String(email ?? "").trim().toLowerCase();
  if (!address) return false;

  const parts = address.split("@");
  if (parts.length !== 2) return false;

  const [localPart, domain] = parts;
  if (!localPart || !domain) return false;

  return allowedDomains.some((allowed) => allowed.trim().toLowerCase() === domain);
}

/** Reads the comma-separated ALLOWED_EMAIL_DOMAINS value into a clean list. */
export function parseAllowedDomains(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/**
 * What each role may do. Everyone signed in can see everything (a lean firm
 * works in the open); roles govern action.
 */
export type Action =
  | "rfp.create"
  | "rfp.edit"
  | "question.confirm"
  | "response.draft"
  | "response.edit"
  | "response.approve"
  | "response.flag"
  | "kb.promote"
  | "kb.edit"
  | "chro.curate"
  | "export.create"
  | "settings.manage"
  | "team.manage"
  /**
   * Edit the voice guide — the prose every draft's system prompt opens with.
   *
   * Deliberately separate from `settings.manage`. The people who notice the voice is
   * wrong are the ones writing and pitching with it, and making them admins to fix a
   * paragraph would also hand them the ability to remove colleagues and change roles.
   * The brand template itself stays under `settings.manage`.
   */
  | "voice.edit";

const ROLE_ACTIONS: Record<Role, ReadonlySet<Action>> = {
  admin: new Set<Action>([
    "rfp.create", "rfp.edit", "question.confirm", "response.draft", "response.edit",
    "response.approve", "response.flag", "kb.promote", "kb.edit", "chro.curate", "export.create",
    "settings.manage", "team.manage", "voice.edit",
  ]),
  consultant: new Set<Action>([
    "rfp.create", "rfp.edit", "question.confirm", "response.draft", "response.edit",
    "response.approve", "response.flag", "kb.promote", "kb.edit", "chro.curate", "export.create",
    // Writes and approves the drafts the guide governs, so best placed to notice it is wrong.
    "voice.edit",
  ]),
  // Client-facing, so they hear how the writing actually lands.
  sales: new Set<Action>(["rfp.create", "rfp.edit", "question.confirm", "response.draft", "response.edit", "response.flag", "chro.curate", "export.create", "voice.edit"]),
  reviewer: new Set<Action>(["response.edit", "response.approve", "response.flag", "kb.promote", "chro.curate"]),
};

export function can(role: Role | string, action: Action): boolean {
  const actions = ROLE_ACTIONS[role as Role];
  return actions ? actions.has(action) : false;
}

/**
 * Fixture accounts. `scripts/dev-session.mjs` creates `dev.<role>@rfp-studio.invalid`
 * users for local verification and the e2e suite, and production shares that
 * database. They can never sign in (SSO only, and the domain is not allowed),
 * but real people must not see them either: to a real viewer the team is real
 * people only; a fixture viewer (the e2e suite) sees everyone.
 */
export const FIXTURE_EMAIL_DOMAIN = "rfp-studio.invalid";

export function isFixtureAccount(email: string | null | undefined): boolean {
  const address = String(email ?? "").trim().toLowerCase();
  return address.endsWith(`@${FIXTURE_EMAIL_DOMAIN}`);
}

export function visibleMembers<T extends { email: string }>(members: readonly T[], viewerEmail: string | null | undefined): T[] {
  if (isFixtureAccount(viewerEmail)) return [...members];
  return members.filter((m) => !isFixtureAccount(m.email));
}
