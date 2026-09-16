"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAudit } from "@/db/audit";
import { db } from "@/db/client";
import { finishKbSource, upsertKbSource } from "@/db/kb-ingest";
import { getApprovedAnswer, getKbEntry, getKbSource, listKbEntries } from "@/db/queries/kb";
import { approvedAnswers, kbEntries, kbSources } from "@/db/schema";
import { KB_ENTRY_TYPES, KB_SOURCE_KINDS } from "@/domain/enums";
import { approvedAnswerInputSchema, embedFieldsChanged, kbEntryInputSchema } from "@/domain/kb";
import { engineConfigError } from "@/engine/client";
import { approvedAnswerEmbedText, embedConfigError, embedDocuments, kbEntryEmbedText } from "@/engine/embed";
import { kbIngestRequested } from "@/inngest/client";
import { ActionError, parseInput, requireCan, requireRfp, runAction, type ActionResult } from "@/lib/actions";
import { kbSourcePath, uploadPrivate } from "@/lib/blob";
import { promoteResponse } from "@/lib/promote";
import { requireJobRunner, sendJobEvent } from "@/lib/jobs";
import { detectKind } from "@/lib/parsing";

/** "Add to KB": promote an approved answer into the knowledge base. The work lives in src/lib/promote.ts, shared with Quick Q&A. */
export async function promoteToKb(rfpId: string, questionId: string): Promise<ActionResult<{ approvedAnswerId: string; canonicalQuestion: string }>> {
  return runAction(async () => {
    const session = await requireCan("kb.promote");
    const rfp = await requireRfp(session, rfpId);
    return promoteResponse(session, rfp, z.string().uuid().parse(questionId));
  });
}

// ---- Knowledge base screen: entries ----

const saveEntrySchema = kbEntryInputSchema.extend({ id: z.string().uuid().optional() });

/**
 * Create or update a knowledge-base entry. The embedding is recomputed only
 * when the text it is built from changed; if Voyage is unavailable the entry
 * is saved unembedded and the caller is told — retrieval skips such rows, and
 * `pnpm kb:seed` fills them in later.
 */
export async function saveKbEntry(input: unknown): Promise<ActionResult<{ id: string; embedded: boolean; warning?: string }>> {
  return runAction(async () => {
    const session = await requireCan("kb.edit");
    const { id, ...next } = parseInput(saveEntrySchema, input);

    const before = id ? await getKbEntry(session.workspaceId, id) : null;
    if (id && !before) throw new ActionError("That entry is not in your workspace.");

    const needsEmbedding = !before || embedFieldsChanged(before, next);
    let embedding: number[] | null = null;
    let warning: string | undefined;
    if (needsEmbedding) {
      const configError = embedConfigError();
      if (configError) warning = `Saved, but not embedded: ${configError} Retrieval skips it until pnpm kb:seed runs.`;
      else {
        try {
          [embedding] = await embedDocuments([kbEntryEmbedText(next)]);
        } catch (err) {
          console.error("[kb] embedding failed:", err instanceof Error ? err.message : err);
          warning = "Saved, but not embedded — Voyage did not answer. Retrieval skips it until pnpm kb:seed runs.";
        }
      }
    }

    const saved = await db.transaction(async (tx) => {
      if (!before) {
        const [row] = await tx
          .insert(kbEntries)
          .values({ ...next, workspaceId: session.workspaceId, embedding })
          .returning({ id: kbEntries.id });
        await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "kb_entry", entityId: row.id, action: "kb.entry_created", diff: { featureName: next.featureName, module: next.module, entryType: next.entryType, embedded: embedding !== null } });
        return row.id;
      }
      const changed = (Object.keys(next) as Array<keyof typeof next>).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(next[k]));
      await tx
        .update(kbEntries)
        .set({ ...next, ...(needsEmbedding ? { embedding } : {}) })
        .where(eq(kbEntries.id, before.id));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "kb_entry", entityId: before.id, action: "kb.entry_updated", diff: { changed, reembedded: needsEmbedding, embedded: needsEmbedding ? embedding !== null : before.embedded } });
      return before.id;
    });

    revalidatePath("/kb");
    return { id: saved, embedded: needsEmbedding ? embedding !== null : (before?.embedded ?? false), warning };
  });
}

/** Deactivated entries stay for the citations that point at them; retrieval and the default list skip them. */
export async function setKbEntryActive(id: string, active: boolean): Promise<ActionResult<{ isActive: boolean }>> {
  return runAction(async () => {
    const session = await requireCan("kb.edit");
    const entryId = z.string().uuid().parse(id);
    const entry = await getKbEntry(session.workspaceId, entryId);
    if (!entry) throw new ActionError("That entry is not in your workspace.");
    await db.transaction(async (tx) => {
      await tx.update(kbEntries).set({ isActive: active }).where(eq(kbEntries.id, entry.id));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "kb_entry", entityId: entry.id, action: active ? "kb.entry_reactivated" : "kb.entry_deactivated", diff: { featureName: entry.featureName } });
    });
    revalidatePath("/kb");
    return { isActive: active };
  });
}

// ---- Knowledge base screen: approved answers ----

/** Edit a promoted answer. The pair is re-embedded when its text changes; tags and module alone are not. */
export async function updateApprovedAnswer(id: string, input: unknown): Promise<ActionResult<{ id: string; embedded: boolean; warning?: string }>> {
  return runAction(async () => {
    const session = await requireCan("kb.edit");
    const answerId = z.string().uuid().parse(id);
    const next = parseInput(approvedAnswerInputSchema, input);
    const before = await getApprovedAnswer(session.workspaceId, answerId);
    if (!before) throw new ActionError("That answer is not in your workspace.");

    const textChanged = before.canonicalQuestion !== next.canonicalQuestion || before.canonicalAnswer !== next.canonicalAnswer;
    let embedding: number[] | null = null;
    let warning: string | undefined;
    if (textChanged) {
      const configError = embedConfigError();
      if (configError) warning = `Saved, but not embedded: ${configError} Retrieval skips it until pnpm kb:seed runs.`;
      else {
        try {
          [embedding] = await embedDocuments([approvedAnswerEmbedText(next)]);
        } catch (err) {
          console.error("[kb] embedding failed:", err instanceof Error ? err.message : err);
          warning = "Saved, but not embedded — Voyage did not answer. Retrieval skips it until pnpm kb:seed runs.";
        }
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(approvedAnswers)
        .set({ ...next, ...(textChanged ? { embedding } : {}) })
        .where(eq(approvedAnswers.id, before.id));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "approved_answer", entityId: before.id, action: "kb.answer_updated", diff: { textChanged, module: next.module, tags: next.tags } });
    });
    revalidatePath("/kb");
    return { id: before.id, embedded: textChanged ? embedding !== null : before.embedded, warning };
  });
}

/** Remove a promoted answer for good: a wrong one must stop being retrievable at once. Past citations keep their stored excerpt. */
export async function deleteApprovedAnswer(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireCan("kb.edit");
    const answerId = z.string().uuid().parse(id);
    const answer = await getApprovedAnswer(session.workspaceId, answerId);
    if (!answer) throw new ActionError("That answer is not in your workspace.");
    await db.transaction(async (tx) => {
      await tx.delete(approvedAnswers).where(eq(approvedAnswers.id, answer.id));
      await writeAudit(tx, {
        workspaceId: session.workspaceId,
        actorId: session.userId,
        entity: "approved_answer",
        entityId: answer.id,
        action: "kb.answer_deleted",
        diff: { canonicalQuestion: answer.canonicalQuestion, canonicalAnswer: answer.canonicalAnswer, module: answer.module, reuseCount: answer.reuseCount, originRfpId: answer.originRfpId },
      });
    });
    revalidatePath("/kb");
    return undefined;
  });
}

// ---- Knowledge base screen: sources ----

const MAX_INGEST_BYTES = 20 * 1024 * 1024;

/**
 * Upload a product document and queue the job that reads it into entries.
 * The file goes to private Blob storage; the kb_sources row carries the
 * job's status so the Sources tab can show it without another table.
 */
export async function ingestKbDocument(formData: FormData): Promise<ActionResult<{ sourceId: string }>> {
  return runAction(async () => {
    const session = await requireCan("kb.edit");
    if (engineConfigError) throw new ActionError(engineConfigError);
    requireJobRunner();

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ActionError("Choose a PDF or DOCX document.");
    const kind = z.enum(KB_SOURCE_KINDS).catch("darwinbox_docs").parse(formData.get("kind"));
    const entryType = z.enum(KB_ENTRY_TYPES).catch("darwinbox_capability").parse(formData.get("entryType"));
    const product = z.string().trim().min(2, "Which product is this about?").max(60).parse(String(formData.get("product") ?? "Darwinbox"));
    const detected = detectKind(file.name, file.type);
    if (detected !== "pdf" && detected !== "docx") throw new ActionError(`${file.name}: only PDF and DOCX documents can be read into the knowledge base.`);
    if (file.size > MAX_INGEST_BYTES) throw new ActionError(`${file.name} is larger than 20 MB.`);

    const { url } = await uploadPrivate(kbSourcePath(session.workspaceId, file.name), file, file.type || undefined);
    const sourceId = await upsertKbSource({ workspaceId: session.workspaceId, sourceName: file.name, kind, fileUrl: url, status: "queued" });
    await sendJobEvent(kbIngestRequested.create({ sourceId, workspaceId: session.workspaceId, sourceName: file.name, fileUrl: url, product, entryType, actorId: session.userId }), {
      onFailure: (reason) => finishKbSource(sourceId, "failed", { error: `Not queued: ${reason}` }),
    });
    await writeAudit(db, { workspaceId: session.workspaceId, actorId: session.userId, entity: "kb_source", entityId: sourceId, action: "kb.source_ingest_requested", diff: { fileName: file.name, kind, product, entryType, sizeBytes: file.size } });
    revalidatePath("/kb");
    return { sourceId };
  });
}

/** Run a document again — after a failure, or to pick up prompt improvements. Product and type follow its existing entries. */
export async function reingestKbSource(sourceId: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireCan("kb.edit");
    if (engineConfigError) throw new ActionError(engineConfigError);
    requireJobRunner();
    const source = await getKbSource(session.workspaceId, z.string().uuid().parse(sourceId));
    if (!source) throw new ActionError("That source is not in your workspace.");
    if (!source.fileUrl) throw new ActionError("This source was ingested from the command line and has no stored file. Run pnpm kb:ingest again.");
    if (source.status === "queued" || source.status === "running") throw new ActionError("This document is already being read.");

    const [first] = await listKbEntries(session.workspaceId, { types: [...KB_ENTRY_TYPES], sourceId: source.id, includeInactive: true });
    const entryType = source.dominantType ?? "darwinbox_capability";
    const product = first?.product ?? "Darwinbox";
    await db.update(kbSources).set({ status: "queued", error: null, progressDone: 0, progressTotal: 0 }).where(eq(kbSources.id, source.id));
    await sendJobEvent(kbIngestRequested.create({ sourceId: source.id, workspaceId: session.workspaceId, sourceName: source.name, fileUrl: source.fileUrl, product, entryType, actorId: session.userId }), {
      onFailure: (reason) => finishKbSource(source.id, "failed", { error: `Not queued: ${reason}` }),
    });
    await writeAudit(db, { workspaceId: session.workspaceId, actorId: session.userId, entity: "kb_source", entityId: source.id, action: "kb.source_reingest_requested", diff: { fileName: source.name } });
    revalidatePath("/kb");
    return undefined;
  });
}
