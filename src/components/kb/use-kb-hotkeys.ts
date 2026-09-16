"use client";

import { useEffect } from "react";

import { dialogOpen, isTyping } from "@/hooks/use-workspace-hotkeys";

export interface KbHotkeyHandlers {
  moveDown: () => void;
  moveUp: () => void;
  open: () => void;
  create?: () => void;
  focusSearch: () => void;
  clear: () => void;
}

/** The workspace's keys, in the knowledge base: `/` search, J/K rows, Enter open, N new, Esc. */
export function useKbHotkeys(h: KbHotkeyHandlers) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialogOpen()) return;
      if (isTyping(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "j":
        case "J":
        case "ArrowDown":
          e.preventDefault();
          h.moveDown();
          break;
        case "k":
        case "K":
        case "ArrowUp":
          e.preventDefault();
          h.moveUp();
          break;
        case "Enter":
          e.preventDefault();
          h.open();
          break;
        case "n":
        case "N":
          if (h.create) {
            e.preventDefault();
            h.create();
          }
          break;
        case "/":
          e.preventDefault();
          h.focusSearch();
          break;
        case "Escape":
          h.clear();
          break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [h]);
}
