const MAX_TAGS = 8;

/** Lower-cased, trimmed, de-duplicated (first occurrence wins), never more than a handful. */
export function tidyTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}
