import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import {
  columnClassificationSchema,
  columnMapFromRoles,
  guessColumnRoles,
  type ColumnMap,
  type GuessedRole,
} from "@/domain/extraction";
import type { ParsedSheet } from "@/lib/parsing";

import { CLASSIFY_SYS, classifyUserMessage } from "../../prompts/extract";

import { EXTRACT_MODEL, ZERO_USAGE, client, readUsage, type UsageReport } from "./client";

export interface ResolvedColumns {
  roles: Record<string, GuessedRole>;
  map: ColumnMap;
  usedModel: boolean;
  usage: UsageReport;
}

/**
 * Which column is the question, which is priority, which carries an earlier
 * answer. Heuristics first — they cover the common headers with no latency
 * or cost — and the model only when a header is unplaced or no question
 * column was found.
 */
export async function resolveColumns(sheet: ParsedSheet): Promise<ResolvedColumns> {
  const guessed = guessColumnRoles(sheet.headers);
  const map = columnMapFromRoles(guessed);
  const unresolved = Object.values(guessed).some((r) => r === "unknown");
  if (map.hasQuestion && !unresolved) return { roles: guessed, map, usedModel: false, usage: ZERO_USAGE };

  const sample = sheet.rows.slice(0, 5).map((r) => r.cells);
  const response = await client.messages.parse({
    model: EXTRACT_MODEL,
    max_tokens: 2_000,
    system: [{ type: "text", text: CLASSIFY_SYS, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: classifyUserMessage(sheet.headers, sample) }],
    output_config: { format: zodOutputFormat(columnClassificationSchema), effort: "low" },
  },
  // Runs inside one Inngest step, i.e. one Vercel invocation capped at 300 s on the Hobby plan.
  { timeout: 60_000, maxRetries: 1 });
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("column classification returned no parseable output");

  // The model's answer wins for every header it named; a header it skipped
  // keeps the heuristic. Only one question column survives.
  const roles: Record<string, GuessedRole> = { ...guessed };
  let questionSeen = false;
  for (const header of sheet.headers) {
    const fromModel = parsed.columns.find((c) => c.header === header)?.role;
    let role: GuessedRole = fromModel ?? guessed[header];
    if (role === "question") {
      if (questionSeen) role = "other";
      questionSeen = true;
    }
    if (role === "unknown") role = "other";
    roles[header] = role;
  }

  return { roles, map: columnMapFromRoles(roles), usedModel: true, usage: readUsage(response.usage) };
}
