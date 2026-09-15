import type { WorkspaceRow } from "@/db/queries/workspace";

/**
 * The client's own columns, from rawMeta. The column that carried the
 * question text is dropped (it would duplicate the Question column); the
 * rest are offered in their original order, first two visible by default.
 * "Never hide the source" — the others are one menu away.
 */
export function clientColumns(rows: WorkspaceRow[]): string[] {
  if (!rows.length) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r.rawMeta)) {
      if (seen.has(k)) continue;
      seen.add(k);
      keys.push(k);
    }
  }

  return keys.filter((k) => {
    let same = 0;
    let filled = 0;
    for (const r of rows) {
      const v = r.rawMeta[k];
      if (v === undefined || v === "") continue;
      filled++;
      if (v.trim() === r.questionText.trim()) same++;
    }
    return filled > 0 && same / filled < 0.8;
  });
}

export function storageKey(rfpId: string) {
  return `rfp-studio:columns:${rfpId}`;
}

export function readVisible(rfpId: string, all: string[]): string[] {
  try {
    const raw = localStorage.getItem(storageKey(rfpId));
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      return parsed.filter((k) => all.includes(k));
    }
  } catch {
    /* storage blocked — fall through */
  }
  return all.slice(0, 1);
}

export function writeVisible(rfpId: string, visible: string[]) {
  try {
    localStorage.setItem(storageKey(rfpId), JSON.stringify(visible));
  } catch {
    /* ignore */
  }
}
