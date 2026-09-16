import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { clients, rfpQuestions, rfps } from "@/db/schema";
import { clipText, EMPTY_SEARCH, escapeLike, isSearchable, likePattern, normaliseQuery, SEARCH_LIMITS, type SearchResults } from "@/domain/search";

/**
 * ⌘K: RFPs by title or client, questions by ref or text, always inside the
 * caller's workspace. Two small ILIKE scans; the workspace filter comes first
 * in both, so the scan is over one tenant's rows.
 */
export async function searchWorkspace(workspaceId: string, q: string, limits: { rfps: number; questions: number } = SEARCH_LIMITS): Promise<SearchResults> {
  if (!isSearchable(q)) return EMPTY_SEARCH;
  const pattern = likePattern(q);
  const exact = normaliseQuery(q).toLowerCase();
  const prefix = `${escapeLike(exact)}%`;

  const [rfpRows, questionRows] = await Promise.all([
    db
      .select({ id: rfps.id, title: rfps.title, status: rfps.status, rfpKind: rfps.kind, clientName: clients.name })
      .from(rfps)
      .innerJoin(clients, eq(rfps.clientId, clients.id))
      .where(and(eq(rfps.workspaceId, workspaceId), or(ilike(rfps.title, pattern), ilike(clients.name, pattern))))
      .orderBy(desc(rfps.updatedAt))
      .limit(limits.rfps),
    db
      .select({ id: rfpQuestions.id, rfpId: rfps.id, rfpTitle: rfps.title, refNo: rfpQuestions.refNo, questionText: rfpQuestions.questionText })
      .from(rfpQuestions)
      .innerJoin(rfps, eq(rfpQuestions.rfpId, rfps.id))
      .where(and(eq(rfps.workspaceId, workspaceId), or(ilike(rfpQuestions.refNo, pattern), ilike(rfpQuestions.questionText, pattern))))
      // An exact ref first ("A.1" before "A.10" and before a text mention), then ref prefixes, then recency and sheet order.
      .orderBy(sql`case when lower(${rfpQuestions.refNo}) = ${exact} then 0 when lower(${rfpQuestions.refNo}) like ${prefix} then 1 else 2 end`, desc(rfps.updatedAt), asc(rfpQuestions.sortOrder))
      .limit(limits.questions),
  ]);

  return {
    rfps: rfpRows.map((r) => ({ kind: "rfp" as const, ...r })),
    questions: questionRows.map((r) => ({ kind: "question" as const, id: r.id, rfpId: r.rfpId, rfpTitle: r.rfpTitle, refNo: r.refNo, text: clipText(r.questionText) })),
  };
}
