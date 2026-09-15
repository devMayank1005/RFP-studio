import Anthropic from "@anthropic-ai/sdk";

import { readSecret } from "@/lib/env";

/**
 * The Claude engine.
 *
 * MODELS (the user's split): Sonnet 5 for column classification, question
 * extraction and bulk drafting — many calls, tight schemas; Opus 5 for the
 * one-per-RFP context brief and, later, the CHRO question set.
 *
 * Never send `budget_tokens` or `temperature` — both are 400s on the 5 family.
 * Adaptive thinking is on by default; `output_config.effort` tunes depth.
 */
export const EXTRACT_MODEL = "claude-sonnet-5";
export const DRAFT_MODEL = "claude-sonnet-5";
export const BRIEF_MODEL = "claude-opus-5";

/**
 * The SDK reads ANTHROPIC_API_KEY implicitly and puts it straight into an HTTP
 * header, so anything but a single clean line throws before the request leaves
 * the server. `readSecret` takes the first line only.
 */
const apiKey = readSecret("ANTHROPIC_API_KEY");

/**
 * Set when the key is missing or malformed, so call sites can tell the user
 * that no amount of retrying will help. Deliberately not a throw: a bad key
 * must not take down the pages that never call the engine.
 */
export const engineConfigError: string | null =
  apiKey === undefined
    ? "ANTHROPIC_API_KEY is not set on the server."
    : !apiKey.startsWith("sk-ant-")
      ? "ANTHROPIC_API_KEY does not look like an Anthropic key (it should start with sk-ant-)."
      : null;

if (engineConfigError) console.error(`[engine] ${engineConfigError}`);

export const client = new Anthropic({ apiKey });

export interface UsageReport {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function readUsage(usage: Anthropic.Messages.Usage | undefined): UsageReport {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
  };
}

export function addUsage(a: UsageReport, b: UsageReport): UsageReport {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export const ZERO_USAGE: UsageReport = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
