import { z } from "zod";

import { AVAILABILITIES, MODULES, type Availability, type Module } from "./enums";
import { tidyTags } from "./tags";

/**
 * `pnpm kb:ingest <file>`: a Darwinbox document becomes knowledge-base
 * entries. The model reads; these pure pieces keep the result honest. No I/O.
 */

export const ingestOutputSchema = z.object({
  entries: z.array(
    z.object({
      feature_name: z.string().describe("Short, specific capability name as a reviewer would search for it"),
      module: z.enum(MODULES),
      body: z.string().describe("What is possible, how it is configured, and the boundary — 2–6 sentences a bid answer can cite"),
      availability: z.enum(AVAILABILITIES),
      tags: z.array(z.string()),
    }),
  ),
});
export type IngestOutput = z.infer<typeof ingestOutputSchema>;
export type RawIngestEntry = IngestOutput["entries"][number];

export interface IngestEntry {
  featureName: string;
  module: Module;
  body: string;
  availability: Availability;
  tags: string[];
}

/** Anything shorter is a heading or a pointer, not a passage an answer can cite. */
export const MIN_BODY_CHARS = 40;

function featureKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Trim, drop the uncitable, and keep one entry per feature — the fuller body wins, tags merge. */
export function normaliseIngestEntries(raw: readonly RawIngestEntry[]): IngestEntry[] {
  const byKey = new Map<string, IngestEntry>();
  for (const r of raw) {
    const featureName = r.feature_name.replace(/\s+/g, " ").trim();
    const body = r.body.trim();
    if (!featureName || body.length < MIN_BODY_CHARS) continue;
    const key = featureKey(featureName);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { featureName, module: r.module, body, availability: r.availability, tags: tidyTags(r.tags) });
      continue;
    }
    const tags = tidyTags([...existing.tags, ...r.tags]);
    byKey.set(key, body.length > existing.body.length ? { ...existing, body, module: r.module, availability: r.availability, tags } : { ...existing, tags });
  }
  return [...byKey.values()];
}

function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Stable key for an entry: re-ingesting the same file updates in place instead of duplicating. */
export function ingestEntrySlug(sourceName: string, featureName: string): string {
  const base = sourceName.replace(/\.[^.]+$/, "");
  return `${kebab(base)}:${kebab(featureName)}`;
}

export function buildIngestUserMessage(input: { sourceName: string; pages: ReadonlyArray<{ page: number; text: string }>; known: readonly string[] }): string {
  return [
    `DOCUMENT: ${input.sourceName}`,
    `ALREADY CAPTURED (do not repeat): ${input.known.length ? input.known.join("; ") : "(none yet)"}`,
    "",
    ...input.pages.map((p) => `--- page ${p.page} ---\n${p.text}`),
  ].join("\n\n");
}
