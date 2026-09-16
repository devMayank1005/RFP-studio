import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { buildChroUserMessage, chroOutputSchema, sanitiseChroOutput, type ChroInput, type ChroSuggestion } from "@/domain/chro";

import { CHRO_SYS } from "../../prompts/chro";

import { BRIEF_MODEL, client, readUsage, type UsageReport } from "./client";

/** One Opus call per RFP: the CHRO agenda. Effort high — this is judgement, not extraction. */
export async function generateChroQuestions(input: ChroInput): Promise<{ questions: ChroSuggestion[]; usage: UsageReport; model: string }> {
  const response = await client.messages.parse({
    model: BRIEF_MODEL,
    max_tokens: 8_000,
    system: [{ type: "text", text: CHRO_SYS, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildChroUserMessage(input) }],
    output_config: { format: zodOutputFormat(chroOutputSchema), effort: "high" },
  });
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("chro generation returned no parseable output");
  return { questions: sanitiseChroOutput(parsed), usage: readUsage(response.usage), model: BRIEF_MODEL };
}
