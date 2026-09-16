import { Inngest, eventType } from "inngest";
import { z } from "zod";

import { KB_ENTRY_TYPES } from "@/domain/enums";
import { readEnv, readSecret } from "@/lib/env";

/**
 * Every event the app emits, defined once as an Inngest v4 EventType: the
 * same object is the function trigger and the typed factory for sending
 * (`inngest.send(documentUploaded.create({ ... }))`).
 */
export const documentUploaded = eventType("rfp/document.uploaded", {
  schema: z.object({ rfpId: z.string(), documentId: z.string(), jobId: z.string() }),
});

export const extractRequested = eventType("rfp/extract.requested", {
  schema: z.object({ rfpId: z.string(), jobId: z.string() }),
});

export const draftRequested = eventType("rfp/draft.requested", {
  schema: z.object({
    rfpId: z.string(),
    jobId: z.string(),
    questionIds: z.array(z.string()),
    instruction: z.string().optional(),
    actorId: z.string(),
  }),
});

/** A document uploaded from the Knowledge base screen, to be read into entries. */
export const kbIngestRequested = eventType("kb/ingest.requested", {
  schema: z.object({
    sourceId: z.string(),
    workspaceId: z.string(),
    sourceName: z.string(),
    fileUrl: z.string(),
    product: z.string(),
    entryType: z.enum(KB_ENTRY_TYPES),
    actorId: z.string(),
  }),
});

/**
 * Keys are passed explicitly (first line only) rather than left to the SDK's
 * own env lookup, so a multi-line paste cannot silently break event delivery.
 * Locally neither is needed: `pnpm inngest:dev` discovers /api/inngest itself.
 */
export const inngest = new Inngest({
  id: "rfp-studio",
  eventKey: readSecret("INNGEST_EVENT_KEY"),
  signingKey: readSecret("INNGEST_SIGNING_KEY"),
  // Outside a production build (dev server, tsx scripts) events go to the
  // local dev server at :8288 and need no key. INNGEST_DEV=1 forces it.
  isDev: process.env.NODE_ENV !== "production" || readEnv("INNGEST_DEV") === "1",
});
