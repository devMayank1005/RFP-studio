import { ROLES } from "./enums";

/** Roles are changed in Settings. The one invariant: a workspace always keeps an admin. */

export interface MemberLike {
  userId: string;
  role: string;
}

export function adminCount(members: readonly MemberLike[]): number {
  return members.filter((m) => m.role === "admin").length;
}

export type RoleChangeCheck = { ok: true; unchanged?: true } | { ok: false; reason: string };

export function canChangeRole(members: readonly MemberLike[], targetUserId: string, newRole: string): RoleChangeCheck {
  const target = members.find((m) => m.userId === targetUserId);
  if (!target) return { ok: false, reason: "That person is not in the workspace." };
  if (!(ROLES as readonly string[]).includes(newRole)) return { ok: false, reason: "Unknown role." };
  if (target.role === newRole) return { ok: true, unchanged: true };
  if (target.role === "admin" && adminCount(members) <= 1) return { ok: false, reason: "The workspace needs at least one admin." };
  return { ok: true };
}
