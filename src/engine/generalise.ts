import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { buildGeneraliseUserMessage, generaliseOutputSchema, sanitiseGeneralised, type GeneraliseInput, type GeneraliseOutput } from "@/domain/kb";

import { GENERALISE_SYS } from "../../prompts/generalise";

import { DRAFT_MODEL, client, readUsage, type UsageReport } from "./client";

/** One Sonnet call: the approved pair, made reusable. The client name is scrubbed again afterwards regardless. */
export async function generaliseAnswer(input: GeneraliseInput): Promise<{ result: GeneraliseOutput; usage: UsageReport; model: string }> {
  const response = await client.messages.parse({
    model: DRAFT_MODEL,
    max_tokens: 4_000,
    system: [{ type: "text", text: GENERALISE_SYS, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildGeneraliseUserMessage(input) }],
    output_config: { format: zodOutputFormat(generaliseOutputSchema), effort: "low" },
  });
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("generalise returned no parseable output");
  return { result: sanitiseGeneralised(parsed, input.clientName), usage: readUsage(response.usage), model: DRAFT_MODEL };
}
