"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAudit } from "@/db/audit";
import { db } from "@/db/client";
import { createJob, finishJob, latestJob } from "@/db/jobs";
import { getChroSourceRows } from "@/db/queries/chro";
import { chroQuestions } from "@/db/schema";
import { assignSortOrders, isStaleQueuedJob, swapNeighbour } from "@/domain/chro";
import { CHRO_STATUSES, CHRO_THEMES, type ChroStatus, type ChroTheme } from "@/domain/enums";
import { engineConfigError } from "@/engine/client";
import { chroRequested } from "@/inngest/client";
import { ActionError, requireCan, requireRfp, runAction, type ActionResult } from "@/lib/actions";
import { requireJobRunner, sendJobEvent } from "@/lib/jobs";

/**
 * The CHRO tab's mutations. Generation is a job (Opus takes a minute or
 * two); curation is immediate. Every action checks the RFP belongs to the
 * workspace and the row belongs to the RFP, and writes an audit row.
 */

const questionTextSchema = z.string().trim().min(1, "Write the question.").max(1_000);
const rationaleSchema = z.string().trim().max(600).optional();

async function ownedRow(rfpId: string, id: string) {
  const [row] = await db
    .select()
    .from(chroQuestions)
    .where(and(eq(chroQuestions.id, z.string().uuid().parse(id)), eq(chroQuestions.rfpId, rfpId)))
    .limit(1);
  if (!row) throw new ActionError("That question is not on this RFP.");
  return row;
}

function pagePath(rfpId: string) {
  return `/rfps/${rfpId}/chro`;
}

/** Queue Opus. replace_suggested clears earlier suggestions and drops; kept questions always survive. */
export async function requestChroQuestions(rfpId: string, mode: "replace_suggested" | "append"): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const session = await requireCan("rfp.edit");
    const rfp = await requireRfp(session, rfpId);
    if (engineConfigError) throw new ActionError(engineConfigError);
    requireJobRunner();
    const running = await latestJob(rfp.id, "chro");
    if (running && isStaleQueuedJob(running)) {
      // Nothing picked it up — the Inngest app was not registered when it was sent. Retire it so the button works again.
      await finishJob(running.id, "failed", "No worker picked this job up. Check the Inngest app is registered (curl -X PUT …/api/inngest), then try again.");
    } else if (running && (running.status === "queued" || running.status === "running")) {
      throw new ActionError("Claude is already writing the questions — give it a minute.");
    }
    const sources = await getChroSourceRows(rfp.id);
    if (!sources.some((s) => s.status !== null)) throw new ActionError("Draft and approve some answers first — the questions come from them.");

    const jobId = await createJob({ rfpId: rfp.id, jobType: "chro", payload: { mode }, createdBy: session.userId, progressTotal: 3 });
    await sendJobEvent(chroRequested.create({ rfpId: rfp.id, jobId, actorId: session.userId, mode }), { jobId });
    await writeAudit(db, { workspaceId: session.workspaceId, actorId: session.userId, entity: "rfp", entityId: rfp.id, action: "chro.generate.started", diff: { jobId, mode } });
    revalidatePath(pagePath(rfp.id));
    return { jobId };
  });
}

export async function setChroStatus(rfpId: string, id: string, status: ChroStatus): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireCan("chro.curate");
    await requireRfp(session, rfpId);
    const next = z.enum(CHRO_STATUSES).parse(status);
    const row = await ownedRow(rfpId, id);
    await db.transaction(async (tx) => {
      await tx.update(chroQuestions).set({ status: next }).where(eq(chroQuestions.id, row.id));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "chro_question", entityId: row.id, action: `chro.${next}`, diff: { before: row.status } });
    });
    revalidatePath(pagePath(rfpId));
    return undefined;
  });
}

export async function editChroQuestion(rfpId: string, id: string, questionText: string, rationale?: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireCan("chro.curate");
    await requireRfp(session, rfpId);
    const text = questionTextSchema.parse(questionText);
    const why = rationaleSchema.parse(rationale);
    const row = await ownedRow(rfpId, id);
    await db.transaction(async (tx) => {
      await tx.update(chroQuestions).set({ questionText: text, ...(why !== undefined ? { rationale: why } : {}) }).where(eq(chroQuestions.id, row.id));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "chro_question", entityId: row.id, action: "chro.edited", diff: { before: row.questionText, after: text } });
    });
    revalidatePath(pagePath(rfpId));
    return undefined;
  });
}

/** One place up or down inside the question's theme. */
export async function moveChroQuestion(rfpId: string, id: string, direction: "up" | "down"): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireCan("chro.curate");
    await requireRfp(session, rfpId);
    const row = await ownedRow(rfpId, id);
    const themeRows = await db.select().from(chroQuestions).where(and(eq(chroQuestions.rfpId, rfpId), eq(chroQuestions.theme, row.theme)));
    const swap = swapNeighbour(themeRows, row.id, direction);
    if (!swap) throw new ActionError(direction === "up" ? "Already first in its theme." : "Already last in its theme.");
    await db.transaction(async (tx) => {
      for (const s of swap) await tx.update(chroQuestions).set({ sortOrder: s.sortOrder }).where(eq(chroQuestions.id, s.id));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "chro_question", entityId: row.id, action: "chro.moved", diff: { direction } });
    });
    revalidatePath(pagePath(rfpId));
    return undefined;
  });
}

/** A reviewer's own question, kept from the start. */
export async function addChroQuestion(rfpId: string, theme: ChroTheme, questionText: string, rationale?: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const session = await requireCan("chro.curate");
    await requireRfp(session, rfpId);
    const t = z.enum(CHRO_THEMES).parse(theme);
    const text = questionTextSchema.parse(questionText);
    const why = rationaleSchema.parse(rationale)?.trim() || `Added by ${session.name}.`;
    const id = await db.transaction(async (tx) => {
      const existing = await tx.select({ theme: chroQuestions.theme, sortOrder: chroQuestions.sortOrder }).from(chroQuestions).where(eq(chroQuestions.rfpId, rfpId));
      const [sortOrder] = assignSortOrders(existing, [{ theme: t }]);
      const [inserted] = await tx.insert(chroQuestions).values({ rfpId, theme: t, questionText: text, rationale: why, sortOrder, status: "kept" }).returning({ id: chroQuestions.id });
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "chro_question", entityId: inserted.id, action: "chro.added", diff: { theme: t } });
      return inserted.id;
    });
    revalidatePath(pagePath(rfpId));
    return { id };
  });
}
