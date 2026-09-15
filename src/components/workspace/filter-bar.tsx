"use client";

import { Columns3, Keyboard, Rows3, Search, Sparkles, X } from "lucide-react";
import { forwardRef } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { JobProgress } from "@/components/wizard/job-progress";
import { cn } from "@/lib/utils";

import type { WorkspaceSort } from "./params";

const SORT_LABEL: Record<WorkspaceSort, string> = {
  triage: "Needs attention first",
  sheet: "Sheet order",
  confidence: "Lowest confidence first",
  status: "By status",
};

export interface FilterBarProps {
  search: string;
  onSearch: (q: string) => void;
  sort: WorkspaceSort;
  onSort: (s: WorkspaceSort) => void;
  density: "comfortable" | "compact";
  onDensity: (d: "comfortable" | "compact") => void;
  clientColumns: string[];
  visibleColumns: string[];
  onVisibleColumns: (cols: string[]) => void;
  visibleCount: number;
  totalCount: number;
  approvedCount: number;
  draftedCount: number;
  undraftedCount: number;
  activeFilterCount: number;
  onClearFilters: () => void;
  onDraft: () => void;
  draftJobId: string | null;
  onDraftDone: () => void;
  onHelp: () => void;
  draftPending: boolean;
}

export const FilterBar = forwardRef<HTMLInputElement, FilterBarProps>(function FilterBar(p, searchRef) {
  return (
    <div className="flex flex-col border-b bg-background">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            placeholder="Search questions, answers…"
            className="h-8 w-64 pl-7 pr-8 text-ui"
            aria-label="Search"
          />
          <Kbd className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2">/</Kbd>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              {SORT_LABEL[p.sort]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Sort</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={p.sort} onValueChange={(v) => p.onSort(v as WorkspaceSort)}>
              {(Object.keys(SORT_LABEL) as WorkspaceSort[]).map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  {SORT_LABEL[s]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {p.clientColumns.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Columns3 />
                Client columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              <DropdownMenuLabel>The client&apos;s own columns</DropdownMenuLabel>
              {p.clientColumns.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c}
                  checked={p.visibleColumns.includes(c)}
                  onCheckedChange={(on) => p.onVisibleColumns(on ? [...p.visibleColumns, c].filter((k, i, a) => a.indexOf(k) === i) : p.visibleColumns.filter((k) => k !== c))}
                  onSelect={(e) => e.preventDefault()}
                >
                  {c}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button variant="ghost" size="sm" className="h-8" onClick={() => p.onDensity(p.density === "compact" ? "comfortable" : "compact")} aria-label="Toggle density">
          <Rows3 className={cn(p.density === "compact" && "text-brand-blue dark:text-sidebar-primary")} />
        </Button>

        {p.activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={p.onClearFilters}>
            <X />
            Clear {p.activeFilterCount} filter{p.activeFilterCount === 1 ? "" : "s"}
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="num text-2xs text-muted-foreground">
            {p.visibleCount === p.totalCount ? `${p.totalCount} questions` : `${p.visibleCount} of ${p.totalCount}`} · <span className="text-meaning-green-text">{p.approvedCount} approved</span> ·{" "}
            <span className="text-meaning-teal-text">{p.draftedCount} drafted</span>
          </span>
          <Button variant="ghost" size="icon-sm" onClick={p.onHelp} aria-label="Keyboard shortcuts">
            <Keyboard />
          </Button>
          <Button size="sm" className="h-8" onClick={p.onDraft} disabled={p.draftPending || !!p.draftJobId || p.undraftedCount === 0}>
            <Sparkles />
            {p.undraftedCount ? `Draft ${p.undraftedCount} undrafted` : "All drafted"}
          </Button>
        </div>
      </div>
      {p.draftJobId && (
        <div className="px-3 pb-2">
          <JobProgress jobId={p.draftJobId} className="p-3" onDone={p.onDraftDone} />
        </div>
      )}
    </div>
  );
});
