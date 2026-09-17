import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { member, user } from "@/db/schema";
import { visibleMembers } from "@/domain/access";
import type { Role } from "@/domain/enums";

export interface MemberRow {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  joinedAt: Date;
}

/**
 * Everyone in the workspace, oldest membership first — as seen by `viewerEmail`:
 * real people never see the fixture accounts (see `visibleMembers`).
 */
export async function listMembers(workspaceId: string, viewerEmail: string): Promise<MemberRow[]> {
  const rows = await db
    .select({ userId: member.userId, name: user.name, email: user.email, image: user.image, role: member.role, joinedAt: member.createdAt })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, workspaceId))
    .orderBy(asc(member.createdAt));
  return visibleMembers(rows, viewerEmail).map((r) => ({ ...r, role: r.role as Role }));
}
