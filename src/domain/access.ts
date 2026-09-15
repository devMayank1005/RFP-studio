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
  | "export.create"
  | "settings.manage"
  | "team.manage";

const ROLE_ACTIONS: Record<Role, ReadonlySet<Action>> = {
  admin: new Set<Action>([
    "rfp.create", "rfp.edit", "question.confirm", "response.draft", "response.edit",
    "response.approve", "response.flag", "kb.promote", "kb.edit", "export.create",
    "settings.manage", "team.manage",
  ]),
  consultant: new Set<Action>([
    "rfp.create", "rfp.edit", "question.confirm", "response.draft", "response.edit",
    "response.approve", "response.flag", "kb.promote", "kb.edit", "export.create",
  ]),
  sales: new Set<Action>(["rfp.create", "rfp.edit", "question.confirm", "response.draft", "response.edit", "response.flag", "export.create"]),
  reviewer: new Set<Action>(["response.edit", "response.approve", "response.flag", "kb.promote"]),
};

export function can(role: Role | string, action: Action): boolean {
  const actions = ROLE_ACTIONS[role as Role];
  return actions ? actions.has(action) : false;
}
