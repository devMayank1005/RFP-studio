"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowRight, Merge, Plus, Scissors, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { createSection, deleteQuestions, mergeQuestions, splitQuestion, updateQuestion, type QuestionPatch } from "@/app/actions/questions";
import { Chip } from "@/components/chips/chips";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SectionRow, SetupQuestionRow } from "@/db/queries/questions";
import { MODULES, MODULE_LABEL, OWNERS, OWNER_LABEL, QUESTION_TYPES, QUESTION_TYPE_LABEL, type Module, type Owner, type QuestionType } from "@/domain/enums";
import { cn } from "@/lib/utils";

import { CellMenu } from "./cell-menu";

const NONE = "__none__";
const GRID = "grid-cols-[32px_64px_180px_minmax(320px,1fr)_120px_96px_150px_48px_88px]";

/**
 * The extraction review grid: every question the model found, editable in
 * place, with merge / split / delete and section assignment. Rows are
 * virtualised (only the visible ~30 mount) and menus render lazily, so a
 * 300-row RFP is instant. The client's requirement text is shown verbatim;
 * edits here are the reviewer's.
 */
export function ExtractedQuestionsTable({ rfpId, questions, sections }: { rfpId: string; questions: SetupQuestionRow[]; sections: SectionRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(questions);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [splitTarget, setSplitTarget] = useState<SetupQuestionRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const patch = useCallback(
    async (id: string, p: QuestionPatch) => {
      let before: SetupQuestionRow | undefined;
      setRows((list) =>
        list.map((r) => {
          if (r.id !== id) return r;
          before = r;
          return { ...r, ...p, sectionTitle: p.sectionId !== undefined ? (sections.find((s) => s.id === p.sectionId)?.title ?? null) : r.sectionTitle };
        }),
      );
      const result = await updateQuestion(rfpId, id, p);
      if (!result.ok) {
        toast.error(result.error);
        if (before) setRows((list) => list.map((r) => (r.id === id ? before! : r)));
      }
    },
    [rfpId, sections],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (sectionFilter !== "all" && (r.sectionId ?? NONE) !== sectionFilter) return false;
      if (!q) return true;
      return r.questionText.toLowerCase().includes(q) || r.refNo.toLowerCase().includes(q) || (r.sectionTitle ?? "").toLowerCase().includes(q);
    });
  }, [rows, search, sectionFilter]);

  // TanStack Virtual mutates its instance in place; the compiler lint flags that by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 10,
    getItemKey: (i) => filtered[i].id,
  });

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someVisibleSelected = filtered.some((r) => selected.has(r.id));
  const selectedRows = rows.filter((r) => selected.has(r.id));

  function toggleAll(on: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      for (const r of filtered) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  }
  function toggle(id: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function runDelete() {
    setConfirmDelete(false);
    const ids = [...selected];
    startTransition(async () => {
      const result = await deleteQuestions(rfpId, ids);
      if (!result.ok) return void toast.error(result.error);
      setRows((list) => list.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
      toast.success(`${result.data.deleted} deleted`);
      router.refresh();
    });
  }

  function runMerge() {
    setConfirmMerge(false);
    startTransition(async () => {
      const ordered = [...selectedRows].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.id);
      const result = await mergeQuestions(rfpId, ordered);
      if (!result.ok) return void toast.error(result.error);
      setSelected(new Set());
      toast.success("Merged");
      router.refresh();
    });
  }

  const sectionOptions = [NONE, ...sections.map((s) => s.id)];
  const sectionLabel = (id: string) => (id === NONE ? "No section" : (sections.find((s) => s.id === id)?.title ?? "?"));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-6 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions…" className="h-8 w-64 pl-7 text-ui" aria-label="Search questions" />
        </div>
        <CellMenu
          ariaLabel="Filter by section"
          value={sectionFilter}
          options={["all", ...sectionOptions]}
          labels={(v) => (v === "all" ? "All sections" : v === NONE ? "Unsectioned" : sectionLabel(v))}
          onChange={setSectionFilter}
          className="h-8 border-border bg-background px-2.5 text-ui"
        />
        <Button variant="outline" size="sm" onClick={() => setNewSectionOpen(true)}>
          <Plus />
          Section
        </Button>

        <div className="mx-1 h-4 w-px bg-border" />
        <span className="num text-2xs text-muted-foreground">{selected.size ? `${selected.size} selected` : `${filtered.length} of ${rows.length}`}</span>
        <Button variant="outline" size="sm" disabled={selected.size < 2 || isPending} onClick={() => setConfirmMerge(true)}>
          <Merge />
          Merge
        </Button>
        <Button variant="outline" size="sm" disabled={selected.size !== 1 || isPending} onClick={() => setSplitTarget(selectedRows[0] ?? null)}>
          <Scissors />
          Split
        </Button>
        <Button variant="outline" size="sm" disabled={!selected.size || isPending} onClick={() => setConfirmDelete(true)}>
          <Trash2 />
          Delete
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild size="sm" disabled={!rows.length}>
            <Link href={`/rfps/${rfpId}/setup/confirm`}>
              Continue to confirm
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto scrollbar-thin" role="grid" aria-rowcount={filtered.length}>
        <div
          className={cn(
            "sticky top-0 z-10 grid min-w-[1160px] items-center gap-x-2 border-b bg-background px-4 py-2 text-2xs font-medium uppercase tracking-[0.08em] text-muted-foreground",
            GRID,
          )}
          role="row"
        >
          <div role="columnheader">
            <Checkbox
              aria-label="Select all visible"
              checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
              onCheckedChange={(v) => toggleAll(!!v)}
            />
          </div>
          <div role="columnheader">Ref</div>
          <div role="columnheader">Section</div>
          <div role="columnheader">Question (client&apos;s wording)</div>
          <div role="columnheader">Type</div>
          <div role="columnheader">Owner</div>
          <div role="columnheader">Module</div>
          <div role="columnheader">Must</div>
          <div role="columnheader">Existing</div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-6 py-10 text-center text-ui text-muted-foreground">No questions match.</p>
        ) : (
          <div className="relative min-w-[1160px]" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const r = filtered[item.index];
              const isSelected = selected.has(r.id);
              return (
                <div
                  key={r.id}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  role="row"
                  aria-selected={isSelected}
                  className={cn(
                    "absolute top-0 left-0 grid w-full items-start gap-x-2 border-b px-4 py-2 text-ui hover:bg-muted/40",
                    GRID,
                    isSelected && "bg-secondary/60 hover:bg-secondary/60",
                  )}
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <div role="gridcell" className="pt-1">
                    <Checkbox aria-label={`Select ${r.refNo}`} checked={isSelected} onCheckedChange={(v) => toggle(r.id, !!v)} />
                  </div>
                  <div role="gridcell" className="num pt-1.5 font-mono text-2xs text-muted-foreground">
                    {r.refNo}
                  </div>
                  <div role="gridcell">
                    <CellMenu
                      ariaLabel="Section"
                      value={r.sectionId ?? NONE}
                      options={sectionOptions}
                      labels={sectionLabel}
                      onChange={(v) => patch(r.id, { sectionId: v === NONE ? null : v })}
                      className="w-full"
                    />
                  </div>
                  <div role="gridcell">
                    <QuestionCell
                      row={r}
                      editing={editingId === r.id}
                      onEdit={() => setEditingId(r.id)}
                      onSave={(text) => {
                        setEditingId(null);
                        if (text !== r.questionText) void patch(r.id, { questionText: text });
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                  <div role="gridcell">
                    <CellMenu ariaLabel="Question type" value={r.questionType} options={QUESTION_TYPES} labels={QUESTION_TYPE_LABEL} onChange={(v) => patch(r.id, { questionType: v as QuestionType })} />
                  </div>
                  <div role="gridcell">
                    <CellMenu ariaLabel="Owner" value={r.owner} options={OWNERS} labels={OWNER_LABEL} onChange={(v) => patch(r.id, { owner: v as Owner })} />
                  </div>
                  <div role="gridcell">
                    <CellMenu ariaLabel="Module" value={r.moduleHint} options={MODULES} labels={MODULE_LABEL} onChange={(v) => patch(r.id, { moduleHint: v as Module })} className="w-full" />
                  </div>
                  <div role="gridcell" className="pt-1">
                    <Checkbox aria-label="Mandatory" checked={r.isMandatory} onCheckedChange={(v) => patch(r.id, { isMandatory: !!v })} />
                  </div>
                  <div role="gridcell" className="pt-1">
                    {r.existingAnswer && (r.existingAnswer.answer || r.existingAnswer.compliance) ? (
                      <Chip tone="blue" title={r.existingAnswer.answer ?? undefined}>
                        {r.existingAnswer.compliance ?? "answer"}
                      </Chip>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.size} question{selected.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>They will not be drafted or exported. The original file is untouched.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={runDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmMerge} onOpenChange={setConfirmMerge}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge {selected.size} questions into one?</AlertDialogTitle>
            <AlertDialogDescription>The texts are joined in sheet order into the first row; the client&apos;s columns from every row are kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runMerge}>Merge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SplitDialog
        rfpId={rfpId}
        target={splitTarget}
        onClose={() => setSplitTarget(null)}
        onDone={() => {
          setSplitTarget(null);
          setSelected(new Set());
          router.refresh();
        }}
      />

      <NewSectionDialog
        open={newSectionOpen}
        onClose={() => setNewSectionOpen(false)}
        onCreate={async (title) => {
          const result = await createSection(rfpId, title);
          if (!result.ok) return void toast.error(result.error);
          setNewSectionOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function QuestionCell({ row, editing, onEdit, onSave, onCancel }: { row: SetupQuestionRow; editing: boolean; onEdit: () => void; onSave: (text: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(row.questionText);
  if (editing) {
    return (
      <Textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onSave(draft.trim() || row.questionText)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(row.questionText);
            onCancel();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(draft.trim() || row.questionText);
        }}
        className="min-h-20 w-full text-ui"
        aria-label="Question text"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onEdit}
      className="block w-full rounded-sm px-1 py-1 text-left leading-snug outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
      title="Click to edit"
    >
      <span className="line-clamp-3 whitespace-pre-line">{row.questionText}</span>
      {row.acceptanceCriteria && <span className="mt-0.5 line-clamp-1 block text-2xs text-muted-foreground">Acceptance: {row.acceptanceCriteria}</span>}
    </button>
  );
}

function SplitDialog({ rfpId, target, onClose, onDone }: { rfpId: string; target: SetupQuestionRow | null; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl" onOpenAutoFocus={() => setText(target?.questionText ?? "")}>
        <DialogHeader>
          <DialogTitle>Split into separate questions</DialogTitle>
          <DialogDescription>Leave a blank line between the parts. Each part becomes its own row, keeping the section, owner and the client&apos;s columns.</DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-48 text-ui" aria-label="Parts" />
        <DialogFooter className="items-center">
          <span className="num mr-auto text-2xs text-muted-foreground">
            {parts.length} part{parts.length === 1 ? "" : "s"}
          </span>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={parts.length < 2 || isPending}
            onClick={() =>
              startTransition(async () => {
                if (!target) return;
                const result = await splitQuestion(rfpId, target.id, parts);
                if (!result.ok) return void toast.error(result.error);
                toast.success(`Split into ${parts.length}`);
                onDone();
              })
            }
          >
            Split
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewSectionDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New section</DialogTitle>
          <DialogDescription>Sections group the grid and the export.</DialogDescription>
        </DialogHeader>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Payroll" autoFocus aria-label="Section title" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={title.trim().length < 1 || isPending} onClick={() => startTransition(() => onCreate(title.trim()).then(() => setTitle("")))}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
