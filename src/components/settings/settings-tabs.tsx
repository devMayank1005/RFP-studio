"use client";

import { useQueryState } from "nuqs";
import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { SETTINGS_TABS, SETTINGS_TAB_LABEL, settingsTabParser, type SettingsTab } from "./params";

/** Three panels from one server fetch; the tab lives in the URL so a link to /settings?tab=brand lands there. */
export function SettingsTabs({ panels }: { panels: Record<SettingsTab, ReactNode> }) {
  const [tab, setTab] = useQueryState("tab", settingsTabParser.withOptions({ shallow: true, history: "replace" }));
  return (
    <Tabs value={tab} onValueChange={(v) => void setTab(v as SettingsTab)} className="flex min-h-0 flex-1 flex-col gap-0">
      <TabsList variant="line" className="w-full justify-start rounded-none border-b bg-background px-6">
        {SETTINGS_TABS.map((t) => (
          <TabsTrigger key={t} value={t} className="text-ui">
            {SETTINGS_TAB_LABEL[t]}
          </TabsTrigger>
        ))}
      </TabsList>
      {SETTINGS_TABS.map((t) => (
        <TabsContent key={t} value={t} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {panels[t]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
