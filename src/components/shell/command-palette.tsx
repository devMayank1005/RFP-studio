"use client";

import { Moon, Plus, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

import { NAV } from "./nav";

interface PaletteContext {
  open: () => void;
}

const Ctx = createContext<PaletteContext>({ open: () => {} });

export function useCommandPalette() {
  return useContext(Ctx);
}

/**
 * ⌘K. Navigation and the few global actions today; RFP and question search
 * joins once the workspace exists. One dialog for the whole app, mounted in
 * the shell.
 */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const run = useCallback((fn: () => void) => {
    setIsOpen(false);
    fn();
  }, []);

  const value = useMemo(() => ({ open: () => setIsOpen(true) }), []);

  return (
    <Ctx.Provider value={value}>
      {children}
      <CommandDialog open={isOpen} onOpenChange={setIsOpen} title="Command palette" description="Jump anywhere">
        <CommandInput placeholder="Type a command or search…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Go to">
            {NAV.map((item) => (
              <CommandItem key={item.href} value={item.title} onSelect={() => run(() => router.push(item.href))}>
                <item.icon />
                {item.title}
                {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem value="New RFP" onSelect={() => run(() => router.push("/rfps/new"))}>
              <Plus />
              New RFP
            </CommandItem>
            <CommandItem
              value="Toggle theme late shift dark light"
              onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}
            >
              {resolvedTheme === "dark" ? <Sun /> : <Moon />}
              {resolvedTheme === "dark" ? "Switch to light" : "Switch to late shift"}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </Ctx.Provider>
  );
}
