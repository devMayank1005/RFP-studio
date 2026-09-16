"use client";

import { FileText, Moon, Plus, Sun, Zap, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { Chip, RfpStatusChip } from "@/components/chips/chips";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { filterStatic, hitHref, hitValue } from "@/domain/search";
import { useSearch } from "@/hooks/use-search";
import { dialogOpen } from "@/hooks/use-workspace-hotkeys";

import { NAV } from "./nav";

interface PaletteContext {
  open: () => void;
}

const Ctx = createContext<PaletteContext>({ open: () => {} });

export function useCommandPalette() {
  return useContext(Ctx);
}

interface Action {
  id: string;
  title: string;
  keywords: readonly string[];
  icon: LucideIcon;
  run: () => void;
}

/**
 * ⌘K. Type to find RFPs (by title or client) and questions (by ref or text)
 * across the workspace, or jump to a screen and the few global actions. One
 * dialog for the whole app, mounted in the shell. cmdk's own filter is off:
 * the server already ranks hits, and the static entries go through
 * filterStatic so a query never hides a result that matched on the server.
 */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { results, searching } = useSearch(q, isOpen);
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // Close if open; otherwise open unless another dialog already has the screen. Read the DOM here, not in an updater.
        if (isOpenRef.current) setIsOpen(false);
        else if (!dialogOpen()) setIsOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const onOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) setQ("");
  }, []);

  const run = useCallback((fn: () => void) => {
    setIsOpen(false);
    setQ("");
    fn();
  }, []);

  const value = useMemo(() => ({ open: () => setIsOpen(true) }), []);

  const actions: Action[] = [
    { id: "new-rfp", title: "New RFP", keywords: ["create", "add", "rfp"], icon: Plus, run: () => router.push("/rfps/new") },
    { id: "new-quick", title: "New Quick Q&A", keywords: ["quick", "paste", "questions", "answers", "draft"], icon: Zap, run: () => router.push("/quick") },
    {
      id: "theme",
      title: resolvedTheme === "dark" ? "Switch to light" : "Switch to late shift",
      keywords: ["theme", "dark", "light", "late shift", "mode"],
      icon: resolvedTheme === "dark" ? Sun : Moon,
      run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    },
  ];
  const nav = filterStatic(NAV, q);
  const visibleActions = filterStatic(actions, q);

  // cmdk only auto-selects when nothing is selected. Results arrive after the
  // keystroke that removed the previously selected item, so keep the selection
  // controlled and move it to the first row only when its item is gone.
  const [selected, setSelected] = useState("");
  const itemValues = [...results.rfps.map(hitValue), ...results.questions.map(hitValue), ...nav.map((n) => `nav:${n.href}`), ...visibleActions.map((a) => `action:${a.id}`)];
  const itemKey = itemValues.join("|");
  useEffect(() => {
    const values = itemKey ? itemKey.split("|") : [];
    if (!values.includes(selected)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(values[0] ?? "");
    }
  }, [itemKey, selected]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <CommandDialog
        open={isOpen}
        onOpenChange={onOpenChange}
        title="Command palette"
        description="Search RFPs and questions, or jump anywhere"
        className="sm:max-w-lg"
        commandProps={{ shouldFilter: false, vimBindings: false, value: selected, onValueChange: setSelected }}
      >
        <CommandInput value={q} onValueChange={setQ} placeholder="Search RFPs, questions…" />
        <CommandList>
          <CommandEmpty>{searching ? "Searching…" : "No results."}</CommandEmpty>
          {results.rfps.length > 0 && (
            <CommandGroup heading="RFPs">
              {results.rfps.map((hit) => (
                <CommandItem key={hit.id} value={hitValue(hit)} onSelect={() => run(() => router.push(hitHref(hit)))}>
                  <FileText />
                  <span className="min-w-0 flex-1 truncate text-ui">{hit.title}</span>
                  <span className="max-w-[40%] truncate text-2xs text-muted-foreground">{hit.clientName}</span>
                  {hit.rfpKind === "quick" && <Chip tone="teal">Quick</Chip>}
                  <CommandShortcut className="tracking-normal">
                    <RfpStatusChip status={hit.status} />
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.questions.length > 0 && (
            <CommandGroup heading="Questions">
              {results.questions.map((hit) => (
                <CommandItem key={hit.id} value={hitValue(hit)} onSelect={() => run(() => router.push(hitHref(hit)))}>
                  <span className="num shrink-0 text-2xs text-muted-foreground">{hit.refNo}</span>
                  <span className="min-w-0 truncate text-ui">{hit.text}</span>
                  <CommandShortcut className="max-w-[35%] truncate tracking-normal">{hit.rfpTitle}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {nav.length > 0 && (
            <CommandGroup heading="Go to">
              {nav.map((item) => (
                <CommandItem key={item.href} value={`nav:${item.href}`} onSelect={() => run(() => router.push(item.href))}>
                  <item.icon />
                  {item.title}
                  {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {visibleActions.length > 0 && (
            <CommandGroup heading="Actions">
              {visibleActions.map((action) => (
                <CommandItem key={action.id} value={`action:${action.id}`} onSelect={() => run(action.run)}>
                  <action.icon />
                  {action.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </Ctx.Provider>
  );
}
