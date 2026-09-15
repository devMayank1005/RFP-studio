import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { brandTemplates } from "@/db/schema";

import { DEFAULT_VOICE_GUIDE } from "../../../prompts/voice";

/** The workspace's active brand template, with the seeded defaults as a fallback. */
export async function getActiveBrand(workspaceId: string) {
  const [row] = await db
    .select()
    .from(brandTemplates)
    .where(and(eq(brandTemplates.workspaceId, workspaceId), eq(brandTemplates.isActive, true)))
    .orderBy(desc(brandTemplates.updatedAt))
    .limit(1);
  return {
    id: row?.id ?? null,
    name: row?.name ?? "Kognoz default",
    primaryColor: row?.primaryColor ?? "#005184",
    accentColor: row?.accentColor ?? "#2B9E85",
    successColor: row?.successColor ?? "#71A247",
    logoUrl: row?.logoUrl ?? "/brand/kognoz-logo.png",
    footerText: row?.footerText ?? null,
    voiceGuide: row?.voiceGuide?.trim() || DEFAULT_VOICE_GUIDE,
  };
}
