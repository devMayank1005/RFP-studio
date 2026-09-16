/**
 * Keyboard chords for navigation: "G D" means press g, then d. Pure: the
 * shell's hook listens; this decides what a shortcut string means.
 */

export const CHORD_PREFIX = "g";
export const CHORD_WINDOW_MS = 1_000;

/** The second key of a "G x" chord, lower-cased; null for anything that is not one. */
export function chordKey(shortcut: string | undefined | null): string | null {
  if (!shortcut) return null;
  const parts = shortcut.trim().toLowerCase().split(/\s+/);
  if (parts.length !== 2 || parts[0] !== CHORD_PREFIX || parts[1].length !== 1) return null;
  return parts[1];
}

/** The item a completed chord opens, matched on the second key. */
export function chordTarget<T extends { shortcut?: string; href: string }>(items: readonly T[], key: string): T | null {
  const k = key.toLowerCase();
  return items.find((item) => chordKey(item.shortcut) === k) ?? null;
}
