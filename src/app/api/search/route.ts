import { NextResponse } from "next/server";

import { searchWorkspace } from "@/db/queries/search";
import { EMPTY_SEARCH, isSearchable, type SearchResults } from "@/domain/search";
import { getSession } from "@/lib/session";

/** ⌘K typeahead. A Route Handler answers 401, never redirects; the palette keys TanStack Query on the normalised query. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q") ?? "";
  const data: SearchResults = isSearchable(q) ? await searchWorkspace(session.workspaceId, q) : EMPTY_SEARCH;
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
