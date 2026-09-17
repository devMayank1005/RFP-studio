
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { clients, rfps } from "@/db/schema";
import type { EngagementType, RfpKind, RfpStatus } from "@/domain/enums";
import { isUuid } from "@/domain/ids";

/**
 * Every query here is workspace-scoped: `workspaceId` comes from the session
 * and is the isolation boundary (no RLS yet — see the plan). Nothing in this
 * file may be called without it.
 */

export interface RfpListRow {
  id: string;
  title: string;
  status: RfpStatus;
  engagementType: EngagementType;
  clientName: string;
  dueDate: string | null;
  updatedAt: Date;
  questionCount: number;
  draftedCount: number;
  approvedCount: number;
  flaggedCount: number;
}

export async function listRfps(workspaceId: string): Promise<RfpListRow[]> {
  const rows = await db
    .select({
      id: rfps.id,
      title: rfps.title,
      status: rfps.status,
      engagementType: rfps.engagementType,
      clientName: clients.name,
      dueDate: rfps.dueDate,
      updatedAt: rfps.updatedAt,
      // Maintained by database triggers (migration 0006) — no join over every question and response.
      questionCount: rfps.questionCount,
      draftedCount: rfps.draftedCount,
      approvedCount: rfps.approvedCount,
      flaggedCount: rfps.flaggedCount,
    })
    .from(rfps)
    .innerJoin(clients, eq(rfps.clientId, clients.id))
    .where(and(eq(rfps.workspaceId, workspaceId), eq(rfps.kind, "full")))
    .orderBy(desc(rfps.updatedAt));

  return rows;
}

export interface RfpHeader {
  id: string;
  title: string;
  status: RfpStatus;
  kind: RfpKind;
  engagementType: EngagementType;
  bidderOfRecord: "kognoz" | "darwinbox" | "joint";
  clientId: string;
  clientName: string;
  dueDate: string | null;
  contextSummary: string | null;
  createdAt: Date;
  questionCount: number;
  draftedCount: number;
  approvedCount: number;
}

/** One RFP with its progress figures, scoped to the workspace. Null when it is not ours. */
export async function getRfpHeader(workspaceId: string, rfpId: string): Promise<RfpHeader | null> {
  if (!isUuid(rfpId)) return null;
  const [row] = await db
    .select({
      id: rfps.id,
      title: rfps.title,
      status: rfps.status,
      kind: rfps.kind,
      engagementType: rfps.engagementType,
      bidderOfRecord: rfps.bidderOfRecord,
      clientId: rfps.clientId,
      clientName: clients.name,
      dueDate: rfps.dueDate,
      contextSummary: rfps.contextSummary,
      createdAt: rfps.createdAt,
      questionCount: rfps.questionCount,
      draftedCount: rfps.draftedCount,
      approvedCount: rfps.approvedCount,
    })
    .from(rfps)
    .innerJoin(clients, eq(rfps.clientId, clients.id))
    .where(and(eq(rfps.workspaceId, workspaceId), eq(rfps.id, rfpId)))
    .limit(1);

  return row ?? null;
}

export async function listClients(workspaceId: string) {
  return db
    .select({ id: clients.id, name: clients.name, industry: clients.industry, headcount: clients.headcount })
    .from(clients)
    .where(eq(clients.workspaceId, workspaceId))
    .orderBy(clients.name);
}
