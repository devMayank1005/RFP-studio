import { createLoader, parseAsStringLiteral } from "nuqs/server";

export const SETTINGS_TABS = ["team", "brand", "voice"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export const SETTINGS_TAB_LABEL: Record<SettingsTab, string> = { team: "Team", brand: "Brand", voice: "Voice guide" };

export const settingsTabParser = parseAsStringLiteral(SETTINGS_TABS).withDefault("team");
export const loadSettingsParams = createLoader({ tab: settingsTabParser });
