"use client";

import { MessageCircleQuestion } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { editChroQuestion, moveChroQuestion, setChroStatus } from "@/app/actions/chro";
import { Chip } from "@/components/chips/chips";
import { EmptyState } from "@/components/shell/empty-state";
import { Kbd } from "@/components/ui/kbd";
import type { ChroRow } from "@/db/queries/chro";
import { CHRO_THEME_HINT, chroCounts, chroReadiness, groupByTheme, sortChroRows, swapNeighbour } from "@/domain/chro";
import { can } from "@/domain/access";
import { CHRO_THEME_LABEL, type ChroStatus, type Role } from "@/domain/enums";
import { dialogOpen, isTyping } from "@/hooks/use-workspace-hotkeys";

import { ChroAddDialog } from "./chro-add-dialog";
import { ChroQuestionCard } from "./chro-question-card";
import { ChroReadiness } from "./chro-readiness";

type Readiness = ReturnType<typeof chroReadiness>;

/**
 * The curated discovery agenda. Rows are local state patched optimistically
 * (the extraction table's pattern); the page keys this component by the row
 * ids, so a finished job or an added question remounts it with fresh rows.
 * Keyboard: J/K move focus, A keep, X drop, E edit, Alt+↑/↓ reorder.
 */
export function ChroBoard({ rfpId, rows: initial, readiness, role, activeJobId, lastJobError }: { rfpId: string; rows: ChroRow[]; readiness: Readiness; role: Role; activeJobId: string | null; lastJobError: string | null }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const canCurate = can(role, "chro.curate");
  const canGenerate = can(role, "rfp.edit");

  const groups = useMemo(() => groupByTheme(sortChroRows(rows)), [rows]);
  const ordered = useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.id)), [groups]);
  const counts = chroCounts(rows);

  const refresh = useCallback(() => router.refresh(), [router]);

  const focusRow = useCallback((id: string) => {
    setActiveId(id);
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  async function setStatus(id: string, status: ChroStatus) {
    const before = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    const result = await setChroStatus(rfpId, id, status);
    if (!result.ok) {
      setRows(before);
      toast.error(result.error);
    }
  }

  async function move(id: string, direction: "up" | "down") {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const swap = swapNeighbour(rows.filter((r) => r.theme === row.theme), id, direction);
    if (!swap) return;
    const before = rows;
    setRows((rs) => rs.map((r) => (r.id === swap[0].id ? { ...r, sortOrder: swap[0].sortOrder } : r.id === swap[1].id ? { ...r, sortOrder: swap[1].sortOrder } : r)));
    const result = await moveChroQuestion(rfpId, id, direction);
    if (!result.ok) {
      setRows(before);
      toast.error(result.error);
    } else queueMicrotask(() => focusRow(id));
  }

  async function saveEdit(id: string, text: string) {
    const before = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, questionText: text.trim() } : r)));
    setEditingId(null);
    const result = await editChroQuestion(rfpId, id, text);
    if (!result.ok) {
      setRows(before);
      toast.error(result.error);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialogOpen() || isTyping(e.target)) return;
      if (e.metaKey || e.ctrlKey) return;
      const i = activeId ? ordered.indexOf(activeId) : -1;
      if (e.altKey) {
        if (activeId && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          e.preventDefault();
          void move(activeId, e.key === "ArrowUp" ? "up" : "down");
        }
        return;
      }
      switch (e.key) {
        case "j":
        case "J":
        case "ArrowDown":
          e.preventDefault();
          if (ordered.length) focusRow(ordered[Math.min(ordered.length - 1, i + 1)]);
          break;
        case "k":
        case "K":
        case "ArrowUp":
          e.preventDefault();
          if (ordered.length) focusRow(ordered[Math.max(0, i - 1)]);
          break;
        case "a":
        case "A":
          if (activeId && canCurate) void setStatus(activeId, "kept");
          break;
        case "x":
        case "X":
          if (activeId && canCurate) void setStatus(activeId, "dropped");
          break;
        case "e":
        case "E":
        case "Enter":
          if (activeId && canCurate) {
            e.preventDefault();
            setEditingId(activeId);
          }
          break;
        case "Escape":
          setActiveId(null);
          break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, ordered, canCurate, rows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChroReadiness rfpId={rfpId} readiness={readiness} hasRows={rows.length > 0} canGenerate={canGenerate} activeJobId={activeJobId} lastJobError={lastJobError} />

      {rows.length === 0 ? (
        <EmptyState
          icon={MessageCircleQuestion}
          title="No discovery questions yet"
          description="Once answers are approved, Claude proposes the questions a first CHRO conversation should open with — grounded in what we could answer and what we could not. You can also add your own."
          action={canCurate ? <ChroAddDialog rfpId={rfpId} defaultTheme="mandate_vision" onAdded={refresh} /> : undefined}
        />
      ) : (
        <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
            <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
              <Chip tone="green" dot>
                <span className="num">{counts.kept}</span> kept
              </Chip>
              <span className="num">{counts.dropped} dropped</span>
              <span aria-hidden>·</span>
              <span className="num">{counts.suggested} suggested</span>
              {canCurate && (
                <span className="ml-auto hidden items-center gap-1 lg:flex">
                  <Kbd>J</Kbd> <Kbd>K</Kbd> move · <Kbd>A</Kbd> keep · <Kbd>X</Kbd> drop · <Kbd>E</Kbd> edit · <Kbd>⌥↑↓</Kbd> reorder
                </span>
              )}
            </div>

            {groups.map((g) => (
              <section key={g.theme} aria-label={CHRO_THEME_LABEL[g.theme]}>
                <header className="mb-2 flex items-baseline gap-2">
                  <h2 className="font-heading text-sm font-semibold">{CHRO_THEME_LABEL[g.theme]}</h2>
                  <span className="num text-2xs text-faint-ink">{g.rows.length}</span>
                  <span className="hidden text-2xs text-muted-foreground sm:inline">· {CHRO_THEME_HINT[g.theme]}</span>
                </header>
                {g.rows.length ? (
                  <ol className="flex flex-col gap-2">
                    {g.rows.map((r, i) => (
                      <ChroQuestionCard
                        key={r.id}
                        row={r}
                        index={i}
                        isFirst={i === 0}
                        isLast={i === g.rows.length - 1}
                        active={r.id === activeId}
                        editing={r.id === editingId}
                        canCurate={canCurate}
                        onFocus={() => setActiveId(r.id)}
                        onStatus={(s) => void setStatus(r.id, s)}
                        onMove={(d) => void move(r.id, d)}
                        onEditStart={() => setEditingId(r.id)}
                        onEditSave={(t) => void saveEdit(r.id, t)}
                        onEditCancel={() => setEditingId(null)}
                      />
                    ))}
                  </ol>
                ) : (
                  <p className="rounded-lg border border-dashed px-4 py-3 text-2xs text-faint-ink">Nothing under this theme yet.</p>
                )}
                {canCurate && (
                  <div className="mt-1">
                    <ChroAddDialog rfpId={rfpId} defaultTheme={g.theme} onAdded={refresh} />
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
