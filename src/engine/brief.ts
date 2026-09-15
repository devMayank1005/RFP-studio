import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { briefSchema, type Brief } from "@/domain/extraction";

import { BRIEF_SYS, briefUserMessage } from "../../prompts/brief";

import { BRIEF_MODEL, client, readUsage, type UsageReport } from "./client";

export interface BriefInput {
  clientName: string;
  clientProfile: Record<string, unknown>;
  rfpTitle: string;
  /** Text of the client's pointer / context documents. */
  pointers: string[];
  /** Narrative parts of the RFP itself (capped by the caller). */
  narrative: string;
  sampleRequirements: string[];
}

const NARRATIVE_CAP = 24_000;

/** One Opus call per RFP: the page of context every draft reads first. */
export async function writeBrief(input: BriefInput): Promise<{ brief: Brief; usage: UsageReport }> {
  const response = await client.messages.parse({
    model: BRIEF_MODEL,
    max_tokens: 6_000,
    system: [{ type: "text", text: BRIEF_SYS, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: briefUserMessage({
          ...input,
          narrative: input.narrative.slice(0, NARRATIVE_CAP),
          sampleRequirements: input.sampleRequirements.slice(0, 40),
        }),
      },
    ],
    output_config: { format: zodOutputFormat(briefSchema), effort: "medium" },
  });
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("brief returned no parseable output");
  return { brief: parsed, usage: readUsage(response.usage) };
}
