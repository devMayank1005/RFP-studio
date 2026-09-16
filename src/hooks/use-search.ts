"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { EMPTY_SEARCH, isSearchable, normaliseQuery, type SearchResults } from "@/domain/search";

export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * The palette's results for what is typed: debounced, keyed on the
 * normalised query so re-typing the same thing hits the cache, cancelled
 * when superseded, and the previous list kept on screen until the next one
 * lands so nothing flickers.
 */
export function useSearch(raw: string, enabled: boolean) {
  const normalised = normaliseQuery(raw);
  const debounced = useDebouncedValue(normalised, 200);
  const active = enabled && isSearchable(debounced);

  const query = useQuery<SearchResults>({
    queryKey: ["search", debounced],
    enabled: active,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(debounced)}`, { cache: "no-store", signal });
      if (!res.ok) throw new Error(`search failed (${res.status})`);
      return (await res.json()) as SearchResults;
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  return {
    results: active ? (query.data ?? EMPTY_SEARCH) : EMPTY_SEARCH,
    // Covers the debounce window too, so "No results" never shows before a request exists.
    searching: enabled && isSearchable(normalised) && (debounced !== normalised || query.isFetching),
    error: active ? query.error : null,
  };
}
