"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

const KEYS: Array<[string, string]> = [
  ["J / K", "Next / previous row"],
  ["Shift + J / K", "Extend selection"],
  ["X", "Select / deselect row"],
  ["⌘ A", "Select every visible row"],
  ["A", "Approve row (or selection)"],
  ["F", "Flag row"],
  ["E / Enter", "Edit the response"],
  ["R", "Regenerate with an instruction"],
  ["[ / ]", "Previous / next section"],
  ["/", "Search"],
  ["Esc", "Clear selection"],
  ["?", "This sheet"],
];

export function HotkeysHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard</DialogTitle>
          <DialogDescription>The grid is built to be reviewed without a mouse.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-ui">
          {KEYS.map(([k, d]) => (
            <div key={k} className="contents">
              <dt>
                <Kbd>{k}</Kbd>
              </dt>
              <dd className="text-muted-foreground">{d}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
