"use client";

import { Check, Sparkles, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

/** Floats over the grid while rows are selected. Bulk approve is the reviewer's biggest lever. */
export function BulkActionBar({
  count,
  approvable,
  onApprove,
  onUnapprove,
  onDraft,
  onClear,
  pending,
}: {
  count: number;
  approvable: number;
  onApprove: () => void;
  onUnapprove: () => void;
  onDraft: () => void;
  onClear: () => void;
  pending: boolean;
}) {
  if (!count) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-[0_8px_24px_-8px_rgba(0,81,132,0.35)]">
        <span className="num pr-1 text-ui font-medium">{count} selected</span>
        <Button size="sm" onClick={onApprove} disabled={pending || approvable === 0}>
          <Check />
          Approve {approvable ? approvable : ""}
          <Kbd className="ml-1">A</Kbd>
        </Button>
        <Button size="sm" variant="outline" onClick={onUnapprove} disabled={pending}>
          <Undo2 />
          Unapprove
        </Button>
        <Button size="sm" variant="outline" onClick={onDraft} disabled={pending}>
          <Sparkles />
          Draft selected
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear} aria-label="Clear selection">
          <X />
          <Kbd>Esc</Kbd>
        </Button>
      </div>
    </div>
  );
}
