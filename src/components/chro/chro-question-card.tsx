"use client";

import { Check, ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ChroRow } from "@/db/queries/chro";
import type { ChroStatus } from "@/domain/enums";
import { cn } from "@/lib/utils";

/**
 * One proposed question. The rationale sits under the teal hairline because
 * the model wrote it; the question itself is the reviewer's to keep, drop,
 * rewrite or reorder. Kept is the only green thing here.
 */
export function ChroQuestionCard({
  row,
  index,
  isFirst,
  isLast,
  active,
  editing,
  canCurate,
  onFocus,
  onStatus,
  onMove,
  onEditStart,
  onEditSave,
  onEditCancel,
}: {
  row: ChroRow;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  active: boolean;
  editing: boolean;
  canCurate: boolean;
  onFocus: () => void;
  onStatus: (status: ChroStatus) => void;
  onMove: (direction: "up" | "down") => void;
  onEditStart: () => void;
  onEditSave: (text: string) => void;
  onEditCancel: () => void;
}) {
  const dropped = row.status === "dropped";
  const kept = row.status === "kept";
  return (
    <li
      data-row-id={row.id}
      tabIndex={active ? 0 : -1}
      onFocus={onFocus}
      className={cn(
        "group relative flex gap-3 rounded-lg border bg-card px-4 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active && "border-brand-blue/50 dark:border-sidebar-primary/50",
        kept && "border-l-2 border-l-brand-green",
      )}
    >
      <span className="num mt-0.5 w-5 shrink-0 font-mono text-2xs text-faint-ink">{index + 1}</span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <EditBox initial={row.questionText} onSave={onEditSave} onCancel={onEditCancel} />
        ) : (
          <p className={cn("text-ui leading-relaxed", dropped && "text-muted-foreground line-through decoration-line-strong")}>{row.questionText}</p>
        )}
        {row.rationale && !editing && <p className="engine-hairline mt-2 pl-3 text-2xs leading-relaxed text-muted-foreground">{row.rationale}</p>}
      </div>
      {canCurate && !editing && (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <ToggleGroup type="single" variant="outline" size="sm" value={row.status === "suggested" ? "" : row.status} onValueChange={(v) => v && onStatus(v as ChroStatus)} aria-label="Keep or drop">
            <ToggleGroupItem value="kept" className="text-2xs data-[state=on]:bg-meaning-green-bg data-[state=on]:text-meaning-green-text" aria-label="Keep">
              <Check className="size-3" />
              Keep
            </ToggleGroupItem>
            <ToggleGroupItem value="dropped" className="text-2xs" aria-label="Drop">
              <X className="size-3" />
              Drop
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <Button variant="ghost" size="icon-xs" aria-label="Edit question" onClick={onEditStart}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-xs" aria-label="Move up" onClick={() => onMove("up")} disabled={isFirst}>
              <ChevronUp />
            </Button>
            <Button variant="ghost" size="icon-xs" aria-label="Move down" onClick={() => onMove("down")} disabled={isLast}>
              <ChevronDown />
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (t: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(value);
        }}
        className="min-h-20 text-ui leading-relaxed"
        aria-label="Question text"
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-2xs text-muted-foreground">
          <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> saves · <Kbd>Esc</Kbd> cancels
        </span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(value)} disabled={!value.trim() || value.trim() === initial.trim()}>
          Save
        </Button>
      </div>
    </div>
  );
}
