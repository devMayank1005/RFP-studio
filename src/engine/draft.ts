import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { buildDraftUserMessage, draftOutputSchema, sanitiseDraft, type DraftOutput, type DraftRequest } from "@/domain/drafting";

import { contextBlock, draftSystemPrompt } from "../../prompts/draft";

import { DRAFT_MODEL, client, readUsage, type UsageReport } from "./client";

export interface DraftInput extends DraftRequest {
  voiceGuide: string;
  contextSummary: string | null;
}

/**
 * One answer. Two cached system blocks — the voice guide + rules (stable for
 * the whole workspace) and the RFP's context brief (stable for the RFP) — so
 * 300 questions in a row pay for the prefix once.
 */
export async function draftResponse(input: DraftInput): Promise<{ draft: DraftOutput; usage: UsageReport; model: string }> {
  const response = await client.messages.parse({
    model: DRAFT_MODEL,
    max_tokens: 4_000,
    system: [
      { type: "text", text: draftSystemPrompt(input.voiceGuide), cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: contextBlock(input.contextSummary), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: buildDraftUserMessage(input) }],
    output_config: { format: zodOutputFormat(draftOutputSchema), effort: "medium" },
  });
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("draft returned no parseable output");
  return { draft: sanitiseDraft(parsed, input.passages), usage: readUsage(response.usage), model: DRAFT_MODEL };
}
