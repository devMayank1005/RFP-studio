import { COMPLIANCE_LEVELS, MODULES, OWNERS, RESPONSE_STATUSES, type Compliance, type Module, type Owner, type ResponseStatus } from "./enums";

/**
 * The review workspace's filter state, as it lives in the URL.
 *
 * One canonical spelling per state: a facet holds known values only, once
 * each, in the facet's own order — and "every value" is written as no value
 * at all, because selecting everything is the same as filtering nothing.
 * That keeps the same filter the same link, keeps `?compliance=fully,fully`
 * from counting twice, and stops "all six compliance levels" from hiding
 * the rows that have no compliance yet.
 *
 * Pure: the parsers, the facet pane and the grid all call into here.
 */

export const FACET_VALUES = {
  status: ["undrafted", ...RESPONSE_STATUSES] as const,
  compliance: COMPLIANCE_LEVELS,
  owner: OWNERS,
  module: MODULES,
} as const;

export type FacetKey = keyof typeof FACET_VALUES;
export type StatusFacet = ResponseStatus | "undrafted";

export interface WorkspaceFilters {
  status: StatusFacet[];
  owner: Owner[];
  compliance: Compliance[];
  module: Module[];
  /** A section id, "none" for unsectioned rows, or "" for every section. */
  section: string;
  q: string;
}

export const NO_FILTERS: WorkspaceFilters = { status: [], owner: [], compliance: [], module: [], section: "", q: "" };

/** What a grid row must carry to be filtered. Structural, so the domain stays free of database types. */
export interface FilterableRow {
  sectionId: string | null;
  status: ResponseStatus | null;
  owner: Owner;
  compliance: Compliance | null;
  moduleHint: Module;
  questionText: string;
  refNo: string;
  responsePreview: string | null;
  rawMeta: Record<string, string>;
}

const FACET_KEYS = Object.keys(FACET_VALUES) as FacetKey[];

/** Known values only, once each, in the facet's own order; the full set collapses to []. */
export function normaliseFacet<T extends string>(values: readonly string[], all: readonly T[]): T[] {
  const wanted = new Set(values);
  const kept = all.filter((v) => wanted.has(v));
  return kept.length === all.length ? [] : kept;
}

/** Add or remove one value, then normalise — so selecting the last remaining option reads as "all". */
export function toggleFacet<T extends string>(current: readonly T[], value: T, all: readonly T[]): T[] {
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return normaliseFacet(next, all);
}

/** No selection matches everything; a selection matches only rows that have one of its values. */
export function matchesFacet(selected: readonly string[], value: string | null): boolean {
  return selected.length === 0 || (value !== null && selected.includes(value));
}

function facetValueOf(row: FilterableRow, key: FacetKey): string | null {
  switch (key) {
    case "status":
      return row.status ?? "undrafted";
    case "owner":
      return row.owner;
    case "compliance":
      return row.compliance;
    case "module":
      return row.moduleHint;
  }
}

function matchesSection(row: FilterableRow, section: string): boolean {
  if (!section) return true;
  return section === "none" ? row.sectionId === null : row.sectionId === section;
}

function matchesSearch(row: FilterableRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    row.questionText.toLowerCase().includes(needle) ||
    row.refNo.toLowerCase().includes(needle) ||
    (row.responsePreview ?? "").toLowerCase().includes(needle) ||
    Object.values(row.rawMeta).some((v) => v.toLowerCase().includes(needle))
  );
}

/** The rows a filter state shows. `ignore` leaves one facet out — how facet counts are computed. */
export function applyWorkspaceFilters<R extends FilterableRow>(rows: readonly R[], filters: WorkspaceFilters, opts: { ignore?: FacetKey } = {}): R[] {
  return rows.filter(
    (row) =>
      matchesSection(row, filters.section) &&
      matchesSearch(row, filters.q) &&
      FACET_KEYS.every((key) => key === opts.ignore || matchesFacet(filters[key], facetValueOf(row, key))),
  );
}

/** How many filter groups are narrowing the grid — what "Clear N filters" should say. */
export function activeFilterGroups(filters: WorkspaceFilters): number {
  return FACET_KEYS.filter((key) => filters[key].length > 0).length + (filters.section ? 1 : 0) + (filters.q.trim() ? 1 : 0);
}

/**
 * Per-value counts for one facet, over the rows every OTHER group leaves —
 * the number answers "what would I see if I clicked this", and the facet's
 * own selection does not shrink its own list to the values already picked.
 */
export function facetCounts(rows: readonly FilterableRow[], filters: WorkspaceFilters, key: FacetKey): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(FACET_VALUES[key].map((v) => [v, 0]));
  for (const row of applyWorkspaceFilters(rows, filters, { ignore: key })) {
    const value = facetValueOf(row, key);
    if (value !== null && value in counts) counts[value]++;
  }
  return counts;
}
