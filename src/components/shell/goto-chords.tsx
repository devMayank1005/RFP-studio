"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { CHORD_PREFIX, CHORD_WINDOW_MS, chordTarget } from "@/domain/nav";
import { dialogOpen, isTyping } from "@/hooks/use-workspace-hotkeys";

import { NAV } from "./nav";

/**
 * The "G D / G Q / G K / G S" chords the palette advertises. A bare g arms
 * for a second; the next key that matches a nav shortcut navigates. Never
 * while typing, with modifiers, or with a dialog open — the same rules the
 * page hotkeys follow. Renders nothing.
 */
export function GotoChords() {
  const router = useRouter();
  useEffect(() => {
    let armedUntil = 0;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target instanceof Element && isTyping(e.target)) || dialogOpen()) return;
      const key = e.key.toLowerCase();
      if (key === CHORD_PREFIX) {
        armedUntil = Date.now() + CHORD_WINDOW_MS;
        return;
      }
      if (Date.now() > armedUntil) return;
      armedUntil = 0;
      const target = chordTarget(NAV, key);
      if (!target) return;
      e.preventDefault();
      router.push(target.href);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
