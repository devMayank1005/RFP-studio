import { createLoader, parseAsBoolean, parseAsString, parseAsStringLiteral } from "nuqs/server";

import { MODULES } from "@/domain/enums";
import { KB_TABS } from "@/domain/kb";

/**
 * The knowledge-base screen's state lives in the URL: which tab, the search,
 * the module filter, a source to narrow to, whether inactive entries show,
 * and the entry open in the editor. Parsers come from nuqs/server so the
 * page loader and the client toolbar share one definition.
 */
export const kbParsers = {
  tab: parseAsStringLiteral(KB_TABS).withDefault("capabilities"),
  q: parseAsString.withDefault(""),
  module: parseAsStringLiteral(MODULES),
  source: parseAsString.withDefault(""),
  inactive: parseAsBoolean.withDefault(false),
  /** An entry id, or "new". */
  entry: parseAsString.withDefault(""),
};

export const loadKbParams = createLoader(kbParsers);
export type KbParams = Awaited<ReturnType<typeof loadKbParams>>;
