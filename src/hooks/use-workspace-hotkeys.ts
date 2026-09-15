"use client";

import { useEffect } from "react";

export interface HotkeyHandlers {
  moveDown: (extend: boolean) => void;
  moveUp: (extend: boolean) => void;
  toggleSelect: () => void;
  selectAll: () => void;
  clear: () => void;
  approve: () => void;
  flag: () => void;
  edit: () => void;
  regenerate: () => void;
  nextSection: () => void;
  prevSection: () => void;
  focusSearch: () => void;
  help: () => void;
  open: () => void;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable || !!el.closest('[contenteditable="true"]');
}

function dialogOpen(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]');
}

/**
 * One document-level listener for the whole workspace. Silent while the
 * reviewer is typing or a dialog/menu is open, so the keys never fight a
 * text field. Reviewers approve 300 rows with J/K/A — this is the product.
 */
export function useWorkspaceHotkeys(h: HotkeyHandlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (dialogOpen()) return;
      const typing = isTyping(e.target);
      const meta = e.metaKey || e.ctrlKey;

      if (typing) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        h.selectAll();
        return;
      }
      if (meta || e.altKey) return;

      switch (e.key) {
        case "j":
        case "J":
        case "ArrowDown":
          e.preventDefault();
          h.moveDown(e.shiftKey);
          break;
        case "k":
        case "K":
        case "ArrowUp":
          e.preventDefault();
          h.moveUp(e.shiftKey);
          break;
        case "x":
        case "X":
          e.preventDefault();
          h.toggleSelect();
          break;
        case "a":
        case "A":
          e.preventDefault();
          h.approve();
          break;
        case "f":
        case "F":
          e.preventDefault();
          h.flag();
          break;
        case "e":
        case "E":
          e.preventDefault();
          h.edit();
          break;
        case "Enter":
          e.preventDefault();
          h.open();
          break;
        case "r":
        case "R":
          e.preventDefault();
          h.regenerate();
          break;
        case "]":
          e.preventDefault();
          h.nextSection();
          break;
        case "[":
          e.preventDefault();
          h.prevSection();
          break;
        case "/":
          e.preventDefault();
          h.focusSearch();
          break;
        case "?":
          e.preventDefault();
          h.help();
          break;
        case "Escape":
          h.clear();
          break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [h, enabled]);
}
