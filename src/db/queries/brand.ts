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
    fontFamily: row?.fontFamily ?? "Inter",
    footerText: row?.footerText ?? null,
    docxTemplateUrl: row?.docxTemplateUrl ?? null,
    pptxTemplateUrl: row?.pptxTemplateUrl ?? null,
    voiceGuide: row?.voiceGuide?.trim() || DEFAULT_VOICE_GUIDE,
    /** Whether the stored guide differs from the built-in default. */
    voiceCustomised: !!row?.voiceGuide?.trim() && row.voiceGuide.trim() !== DEFAULT_VOICE_GUIDE.trim(),
    updatedAt: row?.updatedAt ?? null,
    /** What a save must present back to prove it edited the current text. */
    version: row?.version ?? 1,
  };
}
