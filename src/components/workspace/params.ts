import { createParser, createSerializer, parseAsString, parseAsStringLiteral, type inferParserType } from "nuqs/server";

import { FACET_VALUES, normaliseFacet } from "@/domain/workspace-filters";

/**
 * Workspace filters live in the URL so a reviewer can share "everything
 * flagged in Payroll" as a link. The parsers are the single definition of
 * that URL: the grid, the facet pane and every link into the workspace go
 * through them, and both directions are canonical (see normaliseFacet), so a
 * pasted or hand-edited URL reads as its clean form and is rewritten as such.
 */

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** A multi-select facet: comma-separated, canonical in and out, and "all values" is no value. */
function facetParser<T extends string>(all: readonly T[]) {
  return createParser<T[]>({
    parse: (value) => normaliseFacet(value.split(","), all),
    serialize: (values) => normaliseFacet(values, all).join(","),
    // The full set equals the empty set, so it clears the key like any other default.
    eq: (a, b) => sameList(normaliseFacet(a, all), normaliseFacet(b, all)),
  }).withDefault([] as T[]);
}

export const WORKSPACE_SORTS = ["triage", "sheet", "confidence", "status"] as const;
export type WorkspaceSort = (typeof WORKSPACE_SORTS)[number];

export const workspaceParsers = {
  status: facetParser(FACET_VALUES.status),
  owner: facetParser(FACET_VALUES.owner),
  compliance: facetParser(FACET_VALUES.compliance),
  module: facetParser(FACET_VALUES.module),
  section: parseAsString.withDefault(""),
  q: parseAsString.withDefault(""),
  sort: parseAsStringLiteral(WORKSPACE_SORTS).withDefault("triage"),
  row: parseAsString.withDefault(""),
};

/** The one set of URL options for the workspace: shallow (the page never re-renders on a filter), no history spam. */
export const WORKSPACE_URL_OPTIONS = { shallow: true, history: "replace", clearOnDefault: true } as const;

/** "?status=flagged&row=…" (or "") for a filter state — the only way links into the workspace are built. */
export const serializeWorkspace = createSerializer(workspaceParsers);

export type WorkspaceUrlState = Partial<inferParserType<typeof workspaceParsers>>;

export function workspaceHref(rfpId: string, state: WorkspaceUrlState = {}): string {
  return `/rfps/${rfpId}/workspace${serializeWorkspace(state)}`;
}
