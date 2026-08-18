/**
 * Canvas view state shared between the canvas itself and the panels around it
 * (the Inspector moved to the left rail, so pin/focus/mode can't live inside
 * GraphCanvas any more). Purely presentational — no graph data here.
 */
import { create } from "zustand";

export type CanvasMode = "network" | "money" | "timeline";

interface GraphViewState {
  mode: CanvasMode;
  /** Node whose 1-hop neighbourhood is the only thing drawn, if any. */
  focusId: string | null;
  /** Nodes the player dragged or pinned: the physics loop leaves them alone. */
  pinnedIds: Record<string, true>;
  /** Player override for the relationship name chips on the edges. */
  edgeLabelsEnabled: boolean;
  setMode: (mode: CanvasMode) => void;
  toggleFocus: (id: string) => void;
  clearFocus: () => void;
  pin: (id: string) => void;
  togglePin: (id: string) => void;
  unpinAll: () => void;
  toggleEdgeLabels: () => void;
  resetView: () => void;
}

export const useGraphViewStore = create<GraphViewState>((set) => ({
  mode: "network",
  focusId: null,
  pinnedIds: {},
  edgeLabelsEnabled: true,

  setMode: (mode) => set({ mode }),
  toggleFocus: (id) => set((s) => ({ focusId: s.focusId === id ? null : id })),
  clearFocus: () => set({ focusId: null }),
  pin: (id) => set((s) => (s.pinnedIds[id] ? s : { pinnedIds: { ...s.pinnedIds, [id]: true } })),
  togglePin: (id) =>
    set((s) => {
      const pinnedIds = { ...s.pinnedIds };
      if (pinnedIds[id]) delete pinnedIds[id];
      else pinnedIds[id] = true;
      return { pinnedIds };
    }),
  unpinAll: () => set({ pinnedIds: {} }),
  toggleEdgeLabels: () => set((s) => ({ edgeLabelsEnabled: !s.edgeLabelsEnabled })),
  resetView: () => set({ mode: "network", focusId: null, pinnedIds: {}, edgeLabelsEnabled: true }),
}));
