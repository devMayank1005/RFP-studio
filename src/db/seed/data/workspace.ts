import { DEFAULT_VOICE_GUIDE } from "../../../../prompts/voice";
import { stableId } from "../ids";

export const WORKSPACE_ID = stableId("organization", "kognoz");
export const WORKSPACE_SLUG = "kognoz";
export const WORKSPACE_NAME = "Kognoz Consulting";

export const BRAND_TEMPLATE_ID = stableId("brand_template", "kognoz-default");

/** The voice guide is data, not code: seeded from prompts/voice.ts, edited in Settings. */
export const VOICE_GUIDE = DEFAULT_VOICE_GUIDE;
