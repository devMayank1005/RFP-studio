"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from "react";

import { ComplianceChip, ConfidenceChip, MandatoryChip, OwnerChip, QuestionTypeChip, ResponseStatusChip } from "@/components/chips/chips";
import { Checkbox } from "@/components/ui/checkbox";
import type { WorkspaceRow } from "@/db/queries/workspace";
import { cn } from "@/lib/utils";

export interface GridHandle {
  scrollToId: (id: string) => void;
}

/**
 * The review grid. Virtualised, fixed row height (so J/K can scroll to an
 * index without measuring), roving tabindex on rows, and the client's own
 * columns rendered verbatim beside ours. Rows are `role=row` buttons: click
 * selects, double-click opens the editor.
 */
export function WorkspaceGrid({
  rows,
  activeId,
  selected,
  clientColumns,
  density,
  onActivate,
  onToggle,
  onOpen,
  onHover,
  handleRef,
  empty,
}: {
  rows: WorkspaceRow[];
  activeId: string | null;
  selected: Set<string>;
  clientColumns: string[];
  density: "comfortable" | "compact";
  onActivate: (id: string) => void;
  onToggle: (id: string, on: boolean) => void;
  onOpen: (id: string) => void;
  onHover?: (id: string) => void;
  handleRef?: Ref<GridHandle>;
  /** Shown instead of the filter message when the RFP has no questions at all. */
  empty?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = density === "compact" ? 40 : 60;

  // TanStack Virtual mutates its instance in place; the compiler lint flags that by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    getItemKey: (i) => rows[i].questionId,
  });

  useImperativeHandle(handleRef, () => ({
    scrollToId: (id) => {
      const index = rows.findIndex((r) => r.questionId === id);
      if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
    },
  }));

  // Keep the active row in view and focused when it changes via keyboard.
  useEffect(() => {
    if (!activeId) return;
    const index = rows.findIndex((r) => r.questionId === activeId);
    if (index < 0) return;
    virtualizer.scrollToIndex(index, { align: "auto" });
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-row-id="${activeId}"]`);
    if (el && document.activeElement !== el && !isTypingTarget(document.activeElement)) el.focus({ preventScroll: true });
    // virtualizer is intentionally excluded (stable instance, mutated in place)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, rows]);

  const template = `32px 60px minmax(240px,1.5fr) ${clientColumns.map(() => "140px").join(" ")} 92px 80px 112px 52px minmax(180px,1fr) 96px`.trim();
  const minWidth = 32 + 60 + 240 + clientColumns.length * 140 + 92 + 80 + 112 + 52 + 180 + 96 + 8 * (9 + clientColumns.length);

  return (
    <div ref={scrollRef} className="relative h-full overflow-auto scrollbar-thin" role="grid" aria-rowcount={rows.length} aria-multiselectable>
      <div className="sticky top-0 z-10 grid items-center gap-x-2 border-b bg-background px-3 py-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-muted-foreground" style={{ gridTemplateColumns: template, minWidth }} role="row">
        <div role="columnheader" />
        <div role="columnheader">Ref</div>
        <div role="columnheader">Question</div>
        {clientColumns.map((c) => (
          <div key={c} role="columnheader" className="truncate normal-case tracking-normal" title={`Client column: ${c}`}>
            <span className="text-faint-ink">Client · </span>
            {c}
          </div>
        ))}
        <div role="columnheader">Type</div>
        <div role="columnheader">Owner</div>
        <div role="columnheader">Compliance</div>
        <div role="columnheader">Conf.</div>
        <div role="columnheader">Response</div>
        <div role="columnheader">Status</div>
      </div>

      {rows.length === 0 ? (
        (empty ?? <p className="px-6 py-12 text-center text-ui text-muted-foreground">No rows match these filters.</p>)
      ) : (
        <div className="relative" style={{ height: virtualizer.getTotalSize(), minWidth }}>
          {virtualizer.getVirtualItems().map((item) => {
            const r = rows[item.index];
            const isActive = r.questionId === activeId;
            const isSelected = selected.has(r.questionId);
            return (
              <div
                key={r.questionId}
                data-row-id={r.questionId}
                role="row"
                aria-rowindex={item.index + 1}
                aria-selected={isSelected}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onActivate(r.questionId)}
                onDoubleClick={() => onOpen(r.questionId)}
                onMouseEnter={() => onHover?.(r.questionId)}
                onFocus={() => !isActive && onActivate(r.questionId)}
                className={cn(
                  "absolute top-0 left-0 grid w-full cursor-default items-center gap-x-2 border-b px-3 text-ui outline-none transition-colors",
                  "hover:bg-muted/50",
                  isSelected && "bg-secondary/60 hover:bg-secondary/70",
                  isActive && "bg-secondary/80 shadow-[inset_3px_0_0_0_var(--brand-blue)] dark:shadow-[inset_3px_0_0_0_var(--sidebar-primary)]",
                  isActive && "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                )}
                style={{ transform: `translateY(${item.start}px)`, height: rowHeight, gridTemplateColumns: template }}
              >
                <div role="gridcell" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                  <Checkbox aria-label={`Select ${r.refNo}`} checked={isSelected} onCheckedChange={(v) => onToggle(r.questionId, !!v)} />
                </div>
                <div role="gridcell" className="num truncate font-mono text-2xs text-muted-foreground">
                  {r.refNo}
                </div>
                <div role="gridcell" className="min-w-0">
                  <div className={cn("leading-snug", density === "compact" ? "truncate" : "line-clamp-2")}>{r.questionText}</div>
                  {density !== "compact" && (
                    <div className="mt-0.5 flex items-center gap-1.5 truncate text-2xs text-muted-foreground">
                      {r.sectionTitle && <span className="truncate">{r.sectionTitle}</span>}
                      <MandatoryChip mandatory={r.isMandatory} />
                    </div>
                  )}
                </div>
                {clientColumns.map((c) => (
                  <div key={c} role="gridcell" className={cn("min-w-0 text-2xs text-muted-foreground", density === "compact" ? "truncate" : "line-clamp-2")} title={r.rawMeta[c]}>
                    {r.rawMeta[c] ?? <span className="text-faint-ink">—</span>}
                  </div>
                ))}
                <div role="gridcell">
                  <QuestionTypeChip type={r.questionType} />
                </div>
                <div role="gridcell">
                  <OwnerChip owner={r.owner} />
                </div>
                <div role="gridcell">
                  <ComplianceChip compliance={r.compliance} />
                </div>
                <div role="gridcell">
                  <ConfidenceChip confidence={r.confidence} />
                </div>
                <div role="gridcell" className={cn("min-w-0 text-2xs leading-snug text-foreground/80", density === "compact" ? "truncate" : "line-clamp-2")}>
                  {r.responsePreview ?? <span className="text-faint-ink">Not drafted</span>}
                </div>
                <div role="gridcell" className="flex items-center gap-1">
                  <ResponseStatusChip status={r.status} />
                  {r.openPointCount > 0 && (
                    <span className="num text-2xs text-meaning-amber-text" title={`${r.openPointCount} open point${r.openPointCount === 1 ? "" : "s"}`}>
                      ?{r.openPointCount}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}
