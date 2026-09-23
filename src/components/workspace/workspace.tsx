"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { draftRfp } from "@/app/actions/responses";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { WorkspaceRow } from "@/db/queries/workspace";
import type { Role } from "@/domain/enums";
import { setupStepPath } from "@/domain/routes";
import { confidenceSort, sheetSort, triageSort } from "@/domain/triage";
import { activeFilterGroups, applyWorkspaceFilters, type WorkspaceFilters } from "@/domain/workspace-filters";
import { useApprove, usePrefetchDetail, useWorkspaceRows, workspaceKey, type WorkspaceData } from "@/hooks/use-workspace-data";
import { useWorkspaceHotkeys, type HotkeyHandlers } from "@/hooks/use-workspace-hotkeys";
import { useWorkspaceStore } from "@/store/workspace";

import { BulkActionBar } from "./bulk-action-bar";
import { clientColumns as deriveClientColumns, readVisible, writeVisible } from "./client-columns";
import { ContextPanel } from "./context-panel";
import { FilterBar } from "./filter-bar";
import { HotkeysHelp } from "./hotkeys-help";
import { WORKSPACE_URL_OPTIONS, serializeWorkspace, workspaceParsers } from "./params";
import { SectionsPane } from "./sections-pane";
import { WorkspaceGrid, type GridHandle } from "./workspace-grid";

const STATUS_ORDER = { flagged: 0, ai_draft: 1, edited: 2, approved: 3 } as const;

/**
 * The three-pane review workspace. TanStack Query owns the rows, the URL
 * owns the filters and the selected row, zustand owns the transient UI. A
 * reviewer can work the whole grid from the keyboard.
 */
export function Workspace({ rfpId, initial, role }: { rfpId: string; initial: WorkspaceData; role: Role }) {
  const { data } = useWorkspaceRows(rfpId, initial);
  const rows = data.rows;
  const sections = data.sections;
  const qc = useQueryClient();

  const [params, setParams] = useQueryStates(workspaceParsers, WORKSPACE_URL_OPTIONS);
  const activeId = useWorkspaceStore((s) => s.activeId);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const density = useWorkspaceStore((s) => s.density);
  const setDensity = useWorkspaceStore((s) => s.setDensity);
  const setEditorOpen = useWorkspaceStore((s) => s.setEditorOpen);
  const setRegenerateOpen = useWorkspaceStore((s) => s.setRegenerateOpen);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [helpOpen, setHelpOpen] = useState(false);
  const [draftJobId, setDraftJobId] = useState<string | null>(null);
  const [draftPending, startDraft] = useTransition();
  const gridRef = useRef<GridHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const approve = useApprove(rfpId);
  const prefetch = usePrefetchDetail(rfpId);

  // URL → active row: on first load and whenever the URL moves underneath us (⌘K, back/forward); active row → URL afterwards.
  useEffect(() => {
    if (params.row && params.row !== activeId && rows.some((r) => r.questionId === params.row)) setActive(params.row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.row, rows]);
  // The store outlives the page: never carry this RFP's row into the next one.
  useEffect(() => () => setActive(null), [setActive]);
  useEffect(() => {
    // A deep link the effect above is about to apply must not be cleared by this first pass.
    if (activeId === null && params.row && rows.some((r) => r.questionId === params.row)) return;
    if ((activeId ?? "") !== params.row) void setParams({ row: activeId ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const allClientColumns = useMemo(() => deriveClientColumns(rows), [rows]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  useEffect(() => {
    // localStorage is only readable after hydration; a lazy initialiser would mismatch the server HTML.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleColumns(readVisible(rfpId, allClientColumns));
  }, [rfpId, allClientColumns]);
  const updateVisibleColumns = (cols: string[]) => {
    setVisibleColumns(cols);
    writeVisible(rfpId, cols);
  };

  const filters: WorkspaceFilters = { status: params.status, owner: params.owner, compliance: params.compliance, module: params.module, section: params.section, q: params.q };
  const activeFilterCount = activeFilterGroups(filters);

  // The URL is the filter state, so it must be spelt one way. A pasted or hand-edited link
  // (`?compliance`, `owner=kognoz,darwinbox,not_applicable=fully`) parses to its clean form
  // above; rewrite the address bar to match, and drop a section id this RFP does not have.
  useEffect(() => {
    const canonical = serializeWorkspace(params);
    if (window.location.search !== canonical) window.history.replaceState(window.history.state, "", window.location.pathname + canonical);
    if (params.section && params.section !== "none" && !sections.some((s) => s.id === params.section)) void setParams({ section: "" });
    // Once per load, once the sections are known: later writes go through setParams and are canonical already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  const visibleRows = useMemo(() => {
    const withId = applyWorkspaceFilters(rows, filters).map((r) => ({ ...r, id: r.questionId }));
    switch (params.sort) {
      case "sheet":
        return sheetSort(withId);
      case "confidence":
        return confidenceSort(withId);
      case "status":
        return [...withId].sort((a, b) => (a.status ? STATUS_ORDER[a.status] : -1) - (b.status ? STATUS_ORDER[b.status] : -1) || a.sortOrder - b.sortOrder);
      default:
        return triageSort(withId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, params]);

  const activeRow = rows.find((r) => r.questionId === activeId) ?? null;
  const activeIndex = visibleRows.findIndex((r) => r.questionId === activeId);

  // Prefetch the neighbours' detail so J/K feels instant.
  useEffect(() => {
    if (activeIndex < 0) return;
    for (const i of [activeIndex + 1, activeIndex - 1]) {
      const r = visibleRows[i];
      if (r) void prefetch(r.questionId);
    }
  }, [activeIndex, visibleRows, prefetch]);

  const move = useCallback(
    (delta: number, extend: boolean) => {
      if (!visibleRows.length) return;
      const next = activeIndex < 0 ? (delta > 0 ? 0 : visibleRows.length - 1) : Math.min(visibleRows.length - 1, Math.max(0, activeIndex + delta));
      const id = visibleRows[next].questionId;
      if (extend) setSelected((s) => new Set(s).add(id).add(activeId ?? id));
      setActive(id);
    },
    [visibleRows, activeIndex, activeId, setActive],
  );

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: workspaceKey(rfpId) });
  }, [qc, rfpId]);

  const runDraft = useCallback(
    (ids?: string[]) => {
      startDraft(async () => {
        const result = await draftRfp(rfpId, ids);
        if (!result.ok) return void toast.error(result.error);
        setDraftJobId(result.data.jobId);
        toast.success(`Drafting ${result.data.count} question${result.data.count === 1 ? "" : "s"}`);
      });
    },
    [rfpId],
  );

  const approvableSelected = rows.filter((r) => selected.has(r.questionId) && r.status !== null && r.status !== "approved").map((r) => r.questionId);

  const handlers = useMemo<HotkeyHandlers>(
    () => ({
      moveDown: (extend) => move(1, extend),
      moveUp: (extend) => move(-1, extend),
      toggleSelect: () => {
        if (!activeId) return;
        setSelected((s) => {
          const n = new Set(s);
          if (n.has(activeId)) n.delete(activeId);
          else n.add(activeId);
          return n;
        });
      },
      selectAll: () => setSelected(new Set(visibleRows.map((r) => r.questionId))),
      clear: () => {
        if (selected.size) setSelected(new Set());
        else setActive(null);
      },
      approve: () => {
        const ids = approvableSelected.length ? approvableSelected : activeRow && activeRow.status && activeRow.status !== "approved" ? [activeRow.questionId] : [];
        if (ids.length) approve.mutate(ids);
        else if (activeRow?.status === null) toast.message("Nothing to approve — draft it first (R)");
      },
      flag: () => activeRow && setEditorOpen(false),
      edit: () => activeRow && setEditorOpen(true),
      open: () => activeRow && setEditorOpen(true),
      regenerate: () => activeRow && activeRow.status !== null && setRegenerateOpen(true),
      nextSection: () => jumpSection(1),
      prevSection: () => jumpSection(-1),
      focusSearch: () => searchRef.current?.focus(),
      help: () => setHelpOpen(true),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [move, activeId, activeRow, visibleRows, selected, approvableSelected, approve],
  );

  function jumpSection(delta: number) {
    const ids = sections.map((s) => s.id);
    const currentIdx = params.section ? ids.indexOf(params.section) : -1;
    const next = ids[currentIdx + delta] ?? (delta > 0 ? ids[0] : ids[ids.length - 1]);
    if (next) void setParams({ section: next });
  }

  useWorkspaceHotkeys(handlers);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <FilterBar
        ref={searchRef}
        search={params.q}
        onSearch={(q) => void setParams({ q })}
        sort={params.sort}
        onSort={(sort) => void setParams({ sort })}
        density={density}
        onDensity={setDensity}
        clientColumns={allClientColumns}
        visibleColumns={visibleColumns}
        onVisibleColumns={updateVisibleColumns}
        visibleCount={visibleRows.length}
        totalCount={rows.length}
        approvedCount={rows.filter((r) => r.status === "approved").length}
        draftedCount={rows.filter((r) => r.status !== null).length}
        undraftedCount={rows.filter((r) => r.status === null).length}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => void setParams({ status: [], owner: [], compliance: [], module: [], section: "", q: "" })}
        onDraft={() => runDraft()}
        draftJobId={draftJobId}
        draftPending={draftPending}
        onDraftDone={() => {
          setDraftJobId(null);
          invalidate();
        }}
        onHelp={() => setHelpOpen(true)}
      />

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={17} minSize={12} collapsible collapsedSize={0} className="border-r bg-card/40">
          <SectionsPane rows={rows} sections={sections} filters={filters} onChange={(next) => void setParams(next)} />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={53} minSize={30} className="relative">
          <WorkspaceGrid
            rows={visibleRows as WorkspaceRow[]}
            empty={
              rows.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="No questions yet"
                  description="This RFP's question list has not been extracted and confirmed. Finish setup and the review grid fills in here."
                  action={
                    <Button asChild>
                      <Link href={setupStepPath(rfpId, "upload")}>Continue setup</Link>
                    </Button>
                  }
                />
              ) : undefined
            }
            activeId={activeId}
            selected={selected}
            clientColumns={visibleColumns}
            density={density}
            onActivate={setActive}
            onToggle={(id, on) =>
              setSelected((s) => {
                const n = new Set(s);
                if (on) n.add(id);
                else n.delete(id);
                return n;
              })
            }
            onOpen={(id) => {
              setActive(id);
              setEditorOpen(true);
            }}
            onHover={(id) => void prefetch(id)}
            handleRef={gridRef}
          />
          <BulkActionBar
            count={selected.size}
            approvable={approvableSelected.length}
            pending={approve.isPending || draftPending}
            onApprove={() => approve.mutate(approvableSelected, { onSuccess: () => setSelected(new Set()) })}
            onUnapprove={() => toast.message("Unapprove from the panel, one row at a time, for now")}
            onDraft={() => runDraft([...selected])}
            onClear={() => setSelected(new Set())}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={30} minSize={22} className="border-l bg-card/40">
          <ContextPanel rfpId={rfpId} row={activeRow} role={role} onDraftOne={(id) => runDraft([id])} onJobDone={invalidate} />
        </ResizablePanel>
      </ResizablePanelGroup>

      <HotkeysHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
