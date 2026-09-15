import { draftResponses } from "./draft";
import { extractQuestions } from "./extract";
import { parseUploadedDocument } from "./parse";

/** Every function the app registers with Inngest. `api/inngest/route.ts` serves this list. */
export const functions = [parseUploadedDocument, extractQuestions, draftResponses];
