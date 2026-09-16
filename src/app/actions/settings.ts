"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAudit } from "@/db/audit";
import { db } from "@/db/client";
import { getActiveBrand } from "@/db/queries/brand";
import { brandTemplates } from "@/db/schema";
import { brandFormSchema } from "@/domain/brand";
import { ActionError, parseInput, requireCan, runAction, type ActionResult } from "@/lib/actions";

import { DEFAULT_VOICE_GUIDE } from "../../../prompts/voice";

/** Save the active brand template. The signed-in layout re-renders, so the chrome follows immediately. */
export async function saveBrand(input: unknown): Promise<ActionResult<{ updatedAt: string }>> {
  return runAction(async () => {
    const session = await requireCan("settings.manage");
    const next = parseInput(brandFormSchema, input);
    const current = await getActiveBrand(session.workspaceId);
    const values = { ...next, logoUrl: next.logoUrl || null, footerText: next.footerText || null };

    const updatedAt = await db.transaction(async (tx) => {
      let id = current.id;
      if (!id) {
        const [row] = await tx.insert(brandTemplates).values({ ...values, workspaceId: session.workspaceId, isActive: true }).returning({ id: brandTemplates.id });
        id = row.id;
      } else {
        await tx.update(brandTemplates).set(values).where(eq(brandTemplates.id, id));
      }
      const changed = (Object.keys(values) as Array<keyof typeof values>).filter((k) => String(current[k as keyof typeof current] ?? "") !== String(values[k] ?? ""));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "brand_template", entityId: id, action: "brand.updated", diff: { changed } });
      const [row] = await tx.select({ updatedAt: brandTemplates.updatedAt }).from(brandTemplates).where(eq(brandTemplates.id, id)).limit(1);
      return row.updatedAt;
    });
    revalidatePath("/", "layout");
    return { updatedAt: updatedAt.toISOString() };
  });
}

const voiceSchema = z.string().trim().min(200, "The guide is what every draft opens with — keep at least a few paragraphs.").max(12_000);

/** The voice guide is the first block of every draft's system prompt. Saving affects the next draft, not existing revisions. */
export async function saveVoiceGuide(text: string): Promise<ActionResult<{ chars: number; customised: boolean }>> {
  return runAction(async () => {
    const session = await requireCan("settings.manage");
    const guide = voiceSchema.parse(text);
    const current = await getActiveBrand(session.workspaceId);
    if (!current.id) throw new ActionError("No brand template exists yet — save the brand first.");
    const customised = guide !== DEFAULT_VOICE_GUIDE.trim();
    await db.transaction(async (tx) => {
      await tx.update(brandTemplates).set({ voiceGuide: customised ? guide : null }).where(eq(brandTemplates.id, current.id!));
      await writeAudit(tx, { workspaceId: session.workspaceId, actorId: session.userId, entity: "brand_template", entityId: current.id!, action: "brand.voice_updated", diff: { charsBefore: current.voiceGuide.length, charsAfter: guide.length, customised } });
    });
    revalidatePath("/settings");
    return { chars: guide.length, customised };
  });
}
