import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import type { KbEntryType } from "@/domain/enums";
import { chunkPages } from "@/domain/extraction";
import {
  buildIngestUserMessage,
  buildPrecedentUserMessage,
  ingestOutputSchema,
  normaliseIngestEntries,
  normalisePrecedents,
  precedentOutputSchema,
  type IngestEntry,
  type Precedent,
  type RawIngestEntry,
  type RawPrecedent,
} from "@/domain/ingest";
import type { ParsedPage } from "@/lib/parsing";

import { ingestSystemPrompt } from "../../prompts/ingest";
import { PRECEDENTS_SYS } from "../../prompts/precedents";

import { EXTRACT_MODEL, ZERO_USAGE, addUsage, client, readUsage, type UsageReport } from "./client";

export const INGEST_CHARS_PER_CHUNK = 24_000;

/** Each call runs inside one Inngest step — one Vercel invocation, capped at 300 s on the Hobby plan. */
const REQUEST_OPTIONS = { timeout: 180_000, maxRetries: 1 } as const;

export interface IngestResult {
  entries: IngestEntry[];
  usage: UsageReport;
  calls: number;
}

/** Reads a document chunk by chunk, telling each call what earlier chunks already captured. */
export async function extractKbEntries(pages: ParsedPage[], opts: { sourceName: string; entryType?: KbEntryType; known?: readonly string[]; onProgress?: (done: number, total: number) => void | Promise<void> }): Promise<IngestResult> {
  const chunks = chunkPages(pages, INGEST_CHARS_PER_CHUNK);
  const system = ingestSystemPrompt(opts.entryType ?? "darwinbox_capability");
  const raw: RawIngestEntry[] = [];
  const known: string[] = [...(opts.known ?? [])];
  let usage = ZERO_USAGE;

  for (const [i, pageChunk] of chunks.entries()) {
    const response = await client.messages.parse(
      {
        model: EXTRACT_MODEL,
        max_tokens: 16_000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildIngestUserMessage({ sourceName: opts.sourceName, pages: pageChunk, known }) }],
        output_config: { format: zodOutputFormat(ingestOutputSchema), effort: "medium" },
      },
      REQUEST_OPTIONS,
    );
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

export interface PrecedentResult {
  precedents: Precedent[];
  usage: UsageReport;
  calls: number;
}

/** A past response's pages → question/answer precedents, chunk by chunk, with earlier questions held back from repetition. */
export async function extractPrecedents(pages: ParsedPage[], opts: { sourceName: string; known?: readonly string[]; onProgress?: (done: number, total: number) => void | Promise<void> }): Promise<PrecedentResult> {
  const chunks = chunkPages(pages, INGEST_CHARS_PER_CHUNK);
  const raw: RawPrecedent[] = [];
  const known: string[] = [...(opts.known ?? [])];
  let usage = ZERO_USAGE;

  for (const [i, pageChunk] of chunks.entries()) {
    const response = await client.messages.parse(
      {
        model: EXTRACT_MODEL,
        max_tokens: 16_000,
        system: [{ type: "text", text: PRECEDENTS_SYS, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildPrecedentUserMessage({ sourceName: opts.sourceName, pages: pageChunk, known }) }],
        output_config: { format: zodOutputFormat(precedentOutputSchema), effort: "medium" },
      },
      REQUEST_OPTIONS,
    );
    usage = addUsage(usage, readUsage(response.usage));
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`precedent chunk ${i + 1}/${chunks.length} returned no parseable output`);
    for (const p of parsed.precedents) {
      raw.push(p);
      const q = p.question.trim();
      if (q && !known.some((k) => k.toLowerCase() === q.toLowerCase())) known.push(q.slice(0, 120));
    }
    await opts.onProgress?.(i + 1, chunks.length);
  }

  return { precedents: normalisePrecedents(raw), usage, calls: chunks.length };
}
