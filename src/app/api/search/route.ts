import { NextResponse } from "next/server";

import { withOrg } from "@/db/client";
import { searchWorkspace } from "@/db/queries/search";
import { EMPTY_SEARCH, isSearchable, SEARCH_LIMITS, type SearchResults } from "@/domain/search";
import { getSession } from "@/lib/session";

/** ⌘K typeahead. A Route Handler answers 401, never redirects; the palette keys TanStack Query on the normalised query. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q") ?? "";
  // The transaction pins the tenant, so row-level security backs the explicit filter.
  const data: SearchResults = isSearchable(q) ? await withOrg(session.workspaceId, (tx) => searchWorkspace(session.workspaceId, q, SEARCH_LIMITS, tx)) : EMPTY_SEARCH;
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
