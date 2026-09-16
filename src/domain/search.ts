import type { RfpStatus } from "./enums";
import { rfpLandingPath } from "./routes";

/**
 * ⌘K search, the pure half: what a typed query becomes (the ILIKE pattern
 * the server runs, the filter the static entries pass through), where a hit
 * leads, and how hits stay distinct for cmdk. The query itself is in
 * src/db/queries/search.ts; the palette in src/components/shell.
 */

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;
export const SEARCH_LIMITS = { rfps: 6, questions: 8 } as const;
export const QUESTION_CLIP = 120;

/** Trim, collapse whitespace, cap the length. Runs on both sides so the client's cache key and the server's pattern agree. */
export function normaliseQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX_LENGTH);
}

export function isSearchable(raw: string): boolean {
  return normaliseQuery(raw).length >= SEARCH_MIN_LENGTH;
}

/** Backslash-escape the escape character first, then the wildcards, so typed input never becomes a pattern. */
export function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
}

export function likePattern(raw: string): string {
  return `%${escapeLike(normaliseQuery(raw))}%`;
}

/** One line of text for a result row: whitespace collapsed, cut between words, an ellipsis when cut. */
export function clipText(text: string, max = QUESTION_CLIP): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 2 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

export interface RfpHit {
  kind: "rfp";
  id: string;
  title: string;
  clientName: string;
  status: RfpStatus;
}

export interface QuestionHit {
  kind: "question";
  id: string;
  rfpId: string;
  rfpTitle: string;
  refNo: string;
  text: string;
}

export type SearchHit = RfpHit | QuestionHit;

export interface SearchResults {
  rfps: RfpHit[];
  questions: QuestionHit[];
}

export const EMPTY_SEARCH: SearchResults = { rfps: [], questions: [] };

/** An RFP lands where it lives (setup while in intake, else the workspace); a question opens its workspace with that row selected. */
export function hitHref(hit: SearchHit): string {
  return hit.kind === "rfp" ? rfpLandingPath(hit.id, hit.status) : `/rfps/${hit.rfpId}/workspace?row=${hit.id}`;
}

/** cmdk's item value must be unique and stable; titles may repeat, ids do not. */
export function hitValue(hit: SearchHit): string {
  return `${hit.kind}:${hit.id}`;
}

/** Static entries (navigation, actions) when cmdk's own filter is off: every token of the query, in any order, somewhere in the label or keywords. */
export function matchesStatic(label: string, q: string, keywords: readonly string[] = []): boolean {
  const tokens = normaliseQuery(q).toLowerCase().split(" ").filter(Boolean);
  if (!tokens.length) return true;
  const hay = [label, ...keywords].join(" ").toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

export function filterStatic<T extends { title: string; keywords?: readonly string[] }>(items: readonly T[], q: string): T[] {
  return items.filter((item) => matchesStatic(item.title, q, item.keywords));
}
