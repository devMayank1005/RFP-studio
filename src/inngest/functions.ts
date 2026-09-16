import { generateChro } from "./chro";
import { draftResponses } from "./draft";
import { buildExport } from "./export";
import { extractQuestions } from "./extract";
import { ingestKbSource } from "./ingest-kb";
import { parseUploadedDocument } from "./parse";

/** Every function the app registers with Inngest. `api/inngest/route.ts` serves this list. */
export const functions = [parseUploadedDocument, extractQuestions, draftResponses, ingestKbSource, generateChro, buildExport];
