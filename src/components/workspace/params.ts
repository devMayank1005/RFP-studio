import { parseAsArrayOf, parseAsString, parseAsStringLiteral } from "nuqs/server";

import { COMPLIANCE_LEVELS, MODULES, OWNERS, RESPONSE_STATUSES } from "@/domain/enums";

/**
 * Workspace filters live in the URL so a reviewer can share "everything
 * flagged in Payroll" as a link. Parsers come from nuqs/server so the page
 * loader and the client hooks read the same definitions.
 */
export const workspaceParsers = {
  status: parseAsArrayOf(parseAsStringLiteral([...RESPONSE_STATUSES, "undrafted"] as const)).withDefault([]),
  owner: parseAsArrayOf(parseAsStringLiteral(OWNERS)).withDefault([]),
  compliance: parseAsArrayOf(parseAsStringLiteral(COMPLIANCE_LEVELS)).withDefault([]),
  module: parseAsArrayOf(parseAsStringLiteral(MODULES)).withDefault([]),
  section: parseAsString.withDefault(""),
  q: parseAsString.withDefault(""),
  sort: parseAsStringLiteral(["triage", "sheet", "confidence", "status"] as const).withDefault("triage"),
  row: parseAsString.withDefault(""),
};

export type WorkspaceSort = "triage" | "sheet" | "confidence" | "status";
