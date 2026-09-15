import { parseAsStringLiteral } from "nuqs/server";

/**
 * Shared by the server page (createLoader) and the client toggle. Imported
 * from `nuqs/server` — the root `nuqs` entry is a client module, so a server
 * component importing a parser from it (or from any "use client" file) gets a
 * client reference instead of the parser and throws at render.
 */
export const DASHBOARD_VIEWS = ["table", "kanban"] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

export const dashboardViewParser = parseAsStringLiteral(DASHBOARD_VIEWS).withDefault("table");
