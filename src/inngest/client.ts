import { Inngest, eventType } from "inngest";
import { z } from "zod";

import { EXPORT_FORMATS, KB_ENTRY_TYPES } from "@/domain/enums";
import { EXPORT_SHAPES } from "@/domain/export";
import { QUICK_SOURCES } from "@/domain/quick";
import { jobRunnerConfigMessage } from "@/domain/jobs";
import { readEnv, readSecret } from "@/lib/env";

/**
 * Every event the app emits, defined once as an Inngest v4 EventType: the
 * same object is the function trigger and the typed factory for sending
 * (`inngest.send(documentUploaded.create({ ... }))`).
 */
export const documentUploaded = eventType("rfp/document.uploaded", {
  schema: z.object({ rfpId: z.string(), workspaceId: z.string(), documentId: z.string(), jobId: z.string() }),
});

export const extractRequested = eventType("rfp/extract.requested", {
  schema: z.object({ rfpId: z.string(), workspaceId: z.string(), jobId: z.string() }),
});

export const draftRequested = eventType("rfp/draft.requested", {
  schema: z.object({
    rfpId: z.string(),
    workspaceId: z.string(),
    jobId: z.string(),
    questionIds: z.array(z.string()),
    instruction: z.string().optional(),
    actorId: z.string(),
  }),
});

/** The CHRO discovery agenda for one RFP. replace_suggested keeps kept rows; append adds to whatever is there. */
export const chroRequested = eventType("rfp/chro.requested", {
  schema: z.object({ rfpId: z.string(), workspaceId: z.string(), jobId: z.string(), actorId: z.string(), mode: z.enum(["replace_suggested", "append"]) }),
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
export const exportRequested = eventType("rfp/export.requested", {
  schema: z.object({
    rfpId: z.string(),
    workspaceId: z.string(),
    exportId: z.string(),
    jobId: z.string(),
    format: z.enum(EXPORT_FORMATS),
    actorId: z.string(),
    options: z.object({ approvedOnly: z.boolean().optional(), shape: z.enum(EXPORT_SHAPES).optional() }).optional(),
  }),
});
/** Quick Q&A intake: read the paste or file, extract questions, persist, then hand off to the draft job. */
export const quickRequested = eventType("rfp/quick.requested", {
  schema: z.object({
    rfpId: z.string(),
    workspaceId: z.string(),
    jobId: z.string(),
    actorId: z.string(),
    source: z.enum(QUICK_SOURCES),
    /** The uploaded file, for source = document. */
    documentId: z.string().optional(),
    /** The paste, already stored as a parsed document, for source = paste. */
    parsedTextUrl: z.string().optional(),
  }),
});

/**
 * Keys are passed explicitly (first line only) rather than left to the SDK's
 * own env lookup, so a multi-line paste cannot silently break event delivery.
 * Locally neither is needed: `pnpm inngest:dev` discovers /api/inngest itself.
 */
// Outside a production build (dev server, tsx scripts) events go to the
// local dev server at :8288 and need no key. INNGEST_DEV=1 forces it.
export const cloudMode = process.env.NODE_ENV === "production" && readEnv("INNGEST_DEV") !== "1";

export const inngest = new Inngest({
  id: "rfp-studio",
  eventKey: readSecret("INNGEST_EVENT_KEY"),
  signingKey: readSecret("INNGEST_SIGNING_KEY"),
  isDev: !cloudMode,
});

/**
 * Null when jobs can be sent; otherwise the reason, for actions to refuse
 * before they write a row. Read per call: the dev server reloads .env.local.
 */
export function jobsConfigError(): string | null {
  return jobRunnerConfigMessage({ cloudMode, hasEventKey: !!readSecret("INNGEST_EVENT_KEY") });
}

/**
 * Null when /api/inngest may serve; otherwise why it must refuse. In cloud
 * mode every request to that route must be signed, and the SDK can only
 * check a signature if it has the key — without one it would run whatever
 * arrived. Read per call, like jobsConfigError.
 */
export function inngestServeError(): string | null {
  if (!cloudMode) return null;
  if (!readSecret("INNGEST_SIGNING_KEY")) return "INNGEST_SIGNING_KEY is missing: /api/inngest refuses to serve unsigned requests. See README › Deploying.";
  return jobsConfigError();
}
