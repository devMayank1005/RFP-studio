import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import type { ExecutiveSummary } from "@/domain/export";
import { buildSummaryUserMessage, sanitiseSummary, summaryOutputSchema, type SummaryInput } from "@/domain/summary";

import { SUMMARY_PROMPT_VERSION, summarySystemPrompt } from "../../prompts/summary";

import { client, readUsage, SUMMARY_MODEL, type UsageReport } from "./client";

/** One Sonnet call per Word export: the executive summary, from approved answers only. */
export async function generateExecutiveSummary(input: SummaryInput & { voiceGuide: string }): Promise<{ summary: ExecutiveSummary; usage: UsageReport; model: string; promptVersion: string }> {
  const { voiceGuide, ...rest } = input;
  const response = await client.messages.parse({
    model: SUMMARY_MODEL,
    max_tokens: 3_000,
    system: [{ type: "text", text: summarySystemPrompt(voiceGuide), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildSummaryUserMessage(rest) }],
    output_config: { format: zodOutputFormat(summaryOutputSchema), effort: "medium" },
  });
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("executive summary returned no parseable output");
  return { summary: sanitiseSummary(parsed), usage: readUsage(response.usage), model: SUMMARY_MODEL, promptVersion: SUMMARY_PROMPT_VERSION };
}
