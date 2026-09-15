"use client";

import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * A grid cell that looks like text and opens a menu on click. Unlike a
 * Select, the option list is only mounted while open — the difference
 * between a 250-row grid that paints in 100 ms and one that takes seconds.
 */
export function CellMenu<T extends string>({
  value,
  options,
  labels,
  onChange,
  placeholder = "—",
  className,
  ariaLabel,
}: {
  value: T | null;
  options: readonly T[];
  labels: Record<T, string> | ((v: T) => string);
  onChange: (v: T) => void;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
}) {
  const label = (v: T) => (typeof labels === "function" ? labels(v) : labels[v]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={ariaLabel}
        className={cn(
          "group/cell inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-transparent px-1.5 text-2xs text-foreground outline-none hover:border-border hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-border data-[state=open]:bg-muted",
          value === null && "text-faint-ink",
          className,
        )}
      >
        <span className="truncate">{value === null ? placeholder : label(value)}</span>
        <ChevronDown className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover/cell:opacity-100 group-data-[state=open]/cell:opacity-100" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuRadioGroup value={value ?? ""} onValueChange={(v) => onChange(v as T)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o} value={o} className="text-ui">
              {label(o)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
