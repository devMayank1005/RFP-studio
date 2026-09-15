"use client";

import { create } from "zustand";

export type PanelTab = "response" | "question" | "citations" | "history";

/**
 * UI state of the review workspace that is not data: which row is active,
 * which panel tab is open, whether the editor has focus. Rows, responses
 * and revisions live in TanStack Query; nothing server-owned is stored here.
 */
interface WorkspaceState {
  activeId: string | null;
  panelTab: PanelTab;
  editorOpen: boolean;
  regenerateOpen: boolean;
  density: "comfortable" | "compact";
  setActive: (id: string | null) => void;
  setPanelTab: (tab: PanelTab) => void;
  setEditorOpen: (open: boolean) => void;
  setRegenerateOpen: (open: boolean) => void;
  setDensity: (d: "comfortable" | "compact") => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeId: null,
  panelTab: "response",
  editorOpen: false,
  regenerateOpen: false,
  density: "comfortable",
  setActive: (activeId) => set({ activeId, editorOpen: false, regenerateOpen: false }),
  setPanelTab: (panelTab) => set({ panelTab }),
  setEditorOpen: (editorOpen) => set((s) => ({ editorOpen, panelTab: editorOpen ? "response" : s.panelTab })),
  setRegenerateOpen: (regenerateOpen) => set((s) => ({ regenerateOpen, panelTab: regenerateOpen ? "response" : s.panelTab })),
  setDensity: (density) => set({ density }),
}));
