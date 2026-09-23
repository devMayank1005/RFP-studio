import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { ANSWER_MAX_CHARS, buildDraftUserMessage, draftOutputSchema, fitAnswer, sanitiseDraft, stripCitationMarkers, type DraftOutput, type DraftRequest } from "@/domain/drafting";

import { contextBlock, draftSystemPrompt } from "../../prompts/draft";

import { DRAFT_MODEL, addUsage, client, readUsage, type UsageReport } from "./client";

export interface DraftInput extends DraftRequest {
  voiceGuide: string;
  contextSummary: string | null;
}

export interface DraftResult {
  draft: DraftOutput;
  usage: UsageReport;
  model: string;
  /** True when the answer had to be cut to fit after the model was asked to tighten it. */
  truncated: boolean;
}

/** Runs inside one Inngest step, i.e. one Vercel invocation capped at 300 s on the Hobby plan. */
const REQUEST_OPTIONS = { timeout: 120_000, maxRetries: 1 } as const;

const TIGHTEN_SYS = `You shorten RFP answers. Return the same answer in at most ${ANSWER_MAX_CHARS} characters: keep the compliance lead-in and the single most important fact, drop everything else. One or two complete sentences. No citation markers, no bullets, no new claims.`;

const tightenSchema = z.object({ answer: z.string() });

/**
 * One answer. Two cached system blocks — the voice guide + rules (stable for
 * the whole workspace) and the RFP's context brief (stable for the RFP) — so
 * 300 questions in a row pay for the prefix once.
 *
 * Every answer comes back at most ANSWER_MAX_CHARS long: the rules ask for
 * it, an over-long draft gets one cheap "tighten" pass, and only then is the
 * text cut at a sentence boundary (recorded as `truncated`).
 */
export async function draftResponse(input: DraftInput): Promise<DraftResult> {
  const response = await client.messages.parse(
    {
      model: DRAFT_MODEL,
      max_tokens: 4_000,
      system: [
        { type: "text", text: draftSystemPrompt(input.voiceGuide), cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: contextBlock(input.contextSummary), cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: buildDraftUserMessage(input) }],
      output_config: { format: zodOutputFormat(draftOutputSchema), effort: "medium" },
    },
    REQUEST_OPTIONS,
  );
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("draft returned no parseable output");
  let usage = readUsage(response.usage);
  const { overLimit, ...sanitised } = sanitiseDraft(parsed, input.passages);
  let draft: DraftOutput = sanitised;

  if (overLimit) {
    const tightened = await client.messages.parse(
      {
        model: DRAFT_MODEL,
        max_tokens: 400,
        system: [{ type: "text", text: TIGHTEN_SYS }],
        messages: [{ role: "user", content: draft.draft_text }],
        output_config: { format: zodOutputFormat(tightenSchema), effort: "low" },
      },
      REQUEST_OPTIONS,
    );
    usage = addUsage(usage, readUsage(tightened.usage));
    const answer = tightened.parsed_output?.answer;
    if (answer?.trim()) draft = { ...draft, draft_text: stripCitationMarkers(answer) };
  }

  const fitted = fitAnswer(draft.draft_text);
  return { draft: { ...draft, draft_text: fitted.text }, usage, model: DRAFT_MODEL, truncated: fitted.truncated };
}
