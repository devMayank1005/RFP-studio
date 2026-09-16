import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { chunkPages } from "@/domain/extraction";
import { buildIngestUserMessage, ingestOutputSchema, normaliseIngestEntries, type IngestEntry, type RawIngestEntry } from "@/domain/ingest";
import type { ParsedPage } from "@/lib/parsing";

import { INGEST_SYS } from "../../prompts/ingest";

import { EXTRACT_MODEL, ZERO_USAGE, addUsage, client, readUsage, type UsageReport } from "./client";

export const INGEST_CHARS_PER_CHUNK = 24_000;

export interface IngestResult {
  entries: IngestEntry[];
  usage: UsageReport;
  calls: number;
}

/** Reads a document chunk by chunk, telling each call what earlier chunks already captured. */
export async function extractKbEntries(pages: ParsedPage[], opts: { sourceName: string; onProgress?: (done: number, total: number) => void | Promise<void> }): Promise<IngestResult> {
  const chunks = chunkPages(pages, INGEST_CHARS_PER_CHUNK);
  const raw: RawIngestEntry[] = [];
  const known: string[] = [];
  let usage = ZERO_USAGE;

  for (const [i, pageChunk] of chunks.entries()) {
    const response = await client.messages.parse({
      model: EXTRACT_MODEL,
      max_tokens: 16_000,
      system: [{ type: "text", text: INGEST_SYS, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildIngestUserMessage({ sourceName: opts.sourceName, pages: pageChunk, known }) }],
      output_config: { format: zodOutputFormat(ingestOutputSchema), effort: "medium" },
    });
    usage = addUsage(usage, readUsage(response.usage));
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`ingest chunk ${i + 1}/${chunks.length} returned no parseable output`);
    for (const e of parsed.entries) {
      raw.push(e);
      const name = e.feature_name.trim();
      if (name && !known.some((k) => k.toLowerCase() === name.toLowerCase())) known.push(name);
    }
    await opts.onProgress?.(i + 1, chunks.length);
  }

  return { entries: normaliseIngestEntries(raw), usage, calls: chunks.length };
}
