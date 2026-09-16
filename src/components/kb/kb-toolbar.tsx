"use client";

import { Search, X } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useTransition } from "react";

import { Chip } from "@/components/chips/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MODULES, MODULE_LABEL } from "@/domain/enums";
import type { KbTab } from "@/domain/kb";
import { cn } from "@/lib/utils";

import { kbParsers } from "./params";

export const KB_SEARCH_ID = "kb-search";

/**
 * Filters for the current tab. Every change is a URL change the server
 * re-renders from; the transition keeps the current list on screen until the
 * next one arrives, so typing never flashes a skeleton.
 */
export function KbToolbar({ tab, sourceName, shown, total }: { tab: KbTab; sourceName: string | null; shown: number; total: number }) {
  const [isPending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(kbParsers, { shallow: false, history: "replace", startTransition });
  const entryTab = tab === "capabilities" || tab === "services";
  const noun = tab === "answers" ? "answers" : tab === "sources" ? "sources" : "entries";
  const filtered = params.q || params.module || params.source || params.inactive;

  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b bg-background px-6 py-2 transition-opacity", isPending && "opacity-70")}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={KB_SEARCH_ID}
          value={params.q}
          onChange={(e) => void setParams({ q: e.target.value })}
          placeholder={tab === "answers" ? "Search questions, answers…" : tab === "sources" ? "Search sources…" : "Search names, passages, tags…"}
          className="h-8 w-72 pl-7 pr-8 text-ui"
          aria-label="Search"
        />
        <Kbd className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2">/</Kbd>
      </div>

      {tab !== "sources" && (
        <Select value={params.module ?? "all"} onValueChange={(v) => void setParams({ module: v === "all" ? null : (v as (typeof MODULES)[number]) })}>
          <SelectTrigger size="sm" className="h-8 w-48 text-ui" aria-label="Module">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">All modules</SelectItem>
            {MODULES.map((m) => (
              <SelectItem key={m} value={m}>
                {MODULE_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {entryTab && (
        <Label className="flex h-8 items-center gap-2 rounded-md border px-2.5 text-ui font-normal text-muted-foreground">
          <Switch size="sm" checked={params.inactive} onCheckedChange={(on) => void setParams({ inactive: on })} aria-label="Show inactive entries" />
          Show inactive
        </Label>
      )}

      {params.source && (
        <Chip tone="blue" className="h-8 gap-1 pr-1 text-ui">
          Source: {sourceName ?? "unknown"}
          <Button variant="ghost" size="icon-xs" className="size-5" aria-label="Clear source filter" onClick={() => void setParams({ source: "" })}>
            <X />
          </Button>
        </Chip>
      )}

      {filtered && (
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => void setParams({ q: "", module: null, source: "", inactive: false })}>
          <X />
          Clear filters
        </Button>
      )}

      <span className="num ml-auto text-2xs text-muted-foreground">{shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`}</span>
    </div>
  );
}
