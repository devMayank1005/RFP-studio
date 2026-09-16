"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAudit } from "@/db/audit";
import { db } from "@/db/client";
import { listMembers } from "@/db/queries/team";
import { member } from "@/db/schema";
import { ROLES, type Role } from "@/domain/enums";
import { canChangeRole } from "@/domain/team";
import { ActionError, requireCan, runAction, type ActionResult } from "@/lib/actions";

/** Admins set roles. Roles are re-read on every request in resolveSession, so a change takes effect at once. */
export async function setMemberRole(userId: string, role: Role): Promise<ActionResult<{ userId: string; role: Role }>> {
  return runAction(async () => {
    const session = await requireCan("team.manage");
    const next = z.enum(ROLES).parse(role);
    const target = z.string().min(1).parse(userId);
    const members = await listMembers(session.workspaceId);
    const check = canChangeRole(members, target, next);
    if (!check.ok) throw new ActionError(check.reason);
    if (check.unchanged) return { userId: target, role: next };

    const before = members.find((m) => m.userId === target)!;
    await db.transaction(async (tx) => {
      await tx.update(member).set({ role: next }).where(and(eq(member.organizationId, session.workspaceId), eq(member.userId, target)));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "member", entityId: target, action: "member.role_changed", diff: { email: before.email, before: before.role, after: next } });
    });
    revalidatePath("/settings");
    return { userId: target, role: next };
  });
}
