import type { Compliance, ResponseStatus } from "./enums";

/**
 * The default order of the review grid: where a human's time is worth the
 * most first. Not-supported answers, then flagged ones, then low-confidence
 * drafts, then questions nobody has drafted yet, then the rest by rising
 * confidence, with approved work at the bottom.
 */
export interface TriageRow {
  id: string;
  status: ResponseStatus | null;
  compliance: Compliance | null;
  confidence: number | null;
  sortOrder: number;
}

export const LOW_CONFIDENCE = 0.6;

/** The bucket a row sorts into, 0 first: not supported, flagged, low confidence, not drafted, the rest, approved. */
export function triageRank(row: TriageRow): number {
  if (row.status === "approved") return 5;
  if (row.status === null) return 3;
  if (row.compliance === "not_supported") return 0;
  if (row.status === "flagged") return 1;
  if (row.confidence !== null && row.confidence < LOW_CONFIDENCE) return 2;
  return 4;
}

/** The default grid order: by rank, then rising confidence (undrafted last within a rank), then the sheet's own order. */
export function triageSort<T extends TriageRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ra = triageRank(a);
    const rb = triageRank(b);
    if (ra !== rb) return ra - rb;
    const ca = a.confidence ?? Number.POSITIVE_INFINITY;
    const cb = b.confidence ?? Number.POSITIVE_INFINITY;
    if (ca !== cb) return ca - cb;
    return a.sortOrder - b.sortOrder;
  });
}

/** Rows by rising confidence, undrafted last, ties in the sheet's own order. */
export function confidenceSort<T extends TriageRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ca = a.confidence ?? Number.POSITIVE_INFINITY;
    const cb = b.confidence ?? Number.POSITIVE_INFINITY;
    return ca === cb ? a.sortOrder - b.sortOrder : ca - cb;
  });
}

/** Rows in the order the client's document had them. */
export function sheetSort<T extends TriageRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
}
