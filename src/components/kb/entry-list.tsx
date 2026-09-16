"use client";

import { BookOpen, SearchX } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useCallback, useMemo, useRef, useState } from "react";

import { AvailabilityChip, Chip, KbEntryTypeChip } from "@/components/chips/chips";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import type { KbEntryRow } from "@/db/queries/kb";
import { timeAgo } from "@/domain/dates";
import { MODULE_LABEL } from "@/domain/enums";
import { groupEntriesByModule, type KbEntryTab } from "@/domain/kb";
import { cn } from "@/lib/utils";

import { KB_SEARCH_ID } from "./kb-toolbar";
import { kbParsers } from "./params";
import { useKbHotkeys } from "./use-kb-hotkeys";

const MAX_TAGS = 3;

/**
 * The corpus, grouped by module (or flat when a module is chosen). Rows are
 * keyboard-first like the review grid: J/K move, Enter opens, N starts a new
 * entry. Opening sets `entry` in the URL so a row is a shareable link.
 */
export function EntryList({ rows, tab, grouped, canEdit, filtered }: { rows: KbEntryRow[]; tab: KbEntryTab; grouped: boolean; canEdit: boolean; filtered: boolean }) {
  const [, setParams] = useQueryStates(kbParsers, { shallow: true, history: "push" });
  const [focusedId, setActiveId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const ordered = useMemo(() => rows.map((r) => r.id), [rows]);
  // Derived, not synced: a filter change that drops the focused row simply leaves nothing active.
  const activeId = focusedId && ordered.includes(focusedId) ? focusedId : null;
  const index = activeId ? ordered.indexOf(activeId) : -1;

  const focusRow = useCallback((id: string) => {
    setActiveId(id);
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  const open = useCallback((id: string) => void setParams({ entry: id }), [setParams]);

  const handlers = useMemo(
    () => ({
      moveDown: () => ordered.length && focusRow(ordered[Math.min(ordered.length - 1, index + 1)]),
      moveUp: () => ordered.length && focusRow(ordered[Math.max(0, index - 1)]),
      open: () => activeId && open(activeId),
      create: canEdit ? () => void setParams({ entry: "new" }) : undefined,
      focusSearch: () => document.getElementById(KB_SEARCH_ID)?.focus(),
      clear: () => setActiveId(null),
    }),
    [ordered, index, activeId, canEdit, focusRow, open, setParams],
  );
  useKbHotkeys(handlers);

  if (!rows.length) {
    return filtered ? (
      <EmptyState
        icon={SearchX}
        title="Nothing matches these filters"
        description="Try a shorter search, or clear the module and source filters."
        action={
          <Button variant="outline" onClick={() => void setParams({ q: "", module: null, source: "", inactive: false })}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={BookOpen}
        title={tab === "capabilities" ? "No Darwinbox capabilities yet" : "No Kognoz services yet"}
        description={
          tab === "capabilities"
            ? "Add what the platform can do, module by module, or ingest a Darwinbox document from the Sources tab. Every draft cites from here."
            : "Describe Kognoz's services, case studies and boilerplate so answers about consulting work have something to stand on."
        }
        action={
          canEdit ? (
            <Button onClick={() => void setParams({ entry: "new" })}>
              {tab === "capabilities" ? "Add the first capability" : "Add the first entry"}
              <Kbd className="ml-1">N</Kbd>
            </Button>
          ) : undefined
        }
      />
    );
  }

  const groups = grouped ? groupEntriesByModule(rows) : [{ module: null, rows }];
  const showType = tab === "services";
  const now = new Date();

  return (
    <div ref={listRef} className="p-6" role="list" aria-label="Knowledge base entries">
      <div className="overflow-hidden rounded-lg border bg-card">
        {groups.map((g, gi) => (
          <section key={g.module ?? "flat"} aria-label={g.module ? MODULE_LABEL[g.module] : undefined}>
            {g.module && (
              <header className={cn("sticky top-0 z-10 flex items-center gap-2 border-b bg-muted/70 px-4 py-1.5 backdrop-blur", gi > 0 && "border-t")}>
                <h2 className="text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{MODULE_LABEL[g.module]}</h2>
                <span className="num text-2xs text-faint-ink">{g.rows.length}</span>
              </header>
            )}
            <ul className="divide-y">
              {g.rows.map((r) => {
                const active = r.id === activeId;
                return (
                  <li
                    key={r.id}
                    role="listitem"
                    data-row-id={r.id}
                    tabIndex={active || (!activeId && ordered[0] === r.id) ? 0 : -1}
                    onFocus={() => setActiveId(r.id)}
                    onClick={() => open(r.id)}
                    onKeyDown={(e) => e.key === "Enter" && open(r.id)}
                    className={cn(
                      "group relative flex cursor-pointer items-start gap-4 px-4 py-2.5 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50",
                      active && "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand-blue dark:before:bg-sidebar-primary",
                      !r.isActive && "opacity-60",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-ui font-medium text-foreground group-hover:text-brand-blue dark:group-hover:text-sidebar-primary">{r.featureName}</span>
                        {showType && <KbEntryTypeChip entryType={r.entryType} />}
                        {r.product !== (tab === "capabilities" ? "Darwinbox" : "Kognoz") && <span className="text-2xs text-muted-foreground">· {r.product}</span>}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-2xs text-muted-foreground">{r.body}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      {r.tags.slice(0, MAX_TAGS).map((t) => (
                        <Chip key={t} tone="outline" className="hidden lg:inline-flex">
                          {t}
                        </Chip>
                      ))}
                      {r.tags.length > MAX_TAGS && <span className="num hidden text-2xs text-faint-ink lg:inline">+{r.tags.length - MAX_TAGS}</span>}
                      {!r.embedded && (
                        <Chip tone="amber" title="Not embedded yet — retrieval cannot find it. Run pnpm kb:seed.">
                          Not embedded
                        </Chip>
                      )}
                      {!r.isActive && <Chip tone="outline">Inactive</Chip>}
                      <AvailabilityChip availability={r.availability} />
                      <span className="num hidden w-16 text-right text-2xs text-faint-ink xl:inline">{timeAgo(new Date(r.updatedAt), now)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-2 text-2xs text-faint-ink">
        <Kbd>J</Kbd> <Kbd>K</Kbd> move · <Kbd>Enter</Kbd> open{canEdit ? <> · <Kbd>N</Kbd> new entry</> : null} · <Kbd>/</Kbd> search
      </p>
    </div>
  );
}
