/**
 * Cumulative, per-team GraphPayload the /play route renders. Every source of
 * new graph data — the initial GET /teams/{id}/graph, each POST .../investigate
 * response's `subgraph`, and every WS GRAPH_DISCOVERY event — funnels through
 * `merge()`. Anything not already present gets added to `recentIds`, which
 * GraphCanvas (via PlayRoute) uses to animate newly discovered nodes/edges
 * distinctly from already-known ones — the literal "gasp moment" the design
 * brief calls out.
 */
import { useMemo } from "react";
import { create } from "zustand";
import type { GraphNode, GraphPayload, GraphRelationship } from "@/lib/types";

interface GraphStoreState {
  nodesById: Record<string, GraphNode>;
  relsById: Record<string, GraphRelationship>;
  /** ids (node or relationship) introduced by the most recent merge() call. */
  recentIds: string[];
  /** Single-selection consumers (ToolPalette, GraphDetails) read this. */
  selectedId: string | null;
  /**
   * Node ids selected on the canvas. Shift+click appends/removes; a plain
   * click replaces the whole selection with `[id]`. `selectedId` above is
   * kept as `selectedIds[0] ?? null` for existing single-selection readers.
   */
  selectedIds: string[];
  selectedEdgeId: string | null;
  merge: (payload: GraphPayload) => string[];
  select: (id: string | null) => void;
  toggleSelect: (id: string, shift?: boolean) => void;
  selectEdge: (id: string | null) => void;
  clearRecent: () => void;
  reset: () => void;
}

export const useGraphStore = create<GraphStoreState>((set) => ({
  nodesById: {},
  relsById: {},
  recentIds: [],
  selectedId: null,
  selectedIds: [],
  selectedEdgeId: null,

  merge: (payload) => {
    let discovered: string[] = [];
    set((state) => {
      const nodesById = { ...state.nodesById };
      const relsById = { ...state.relsById };
      discovered = [];

      for (const node of payload.nodes) {
        if (!nodesById[node.id]) discovered.push(node.id);
        nodesById[node.id] = node;
      }
      for (const rel of payload.relationships) {
        if (!relsById[rel.id]) discovered.push(rel.id);
        relsById[rel.id] = rel;
      }

      if (discovered.length === 0) return state;
      return { nodesById, relsById, recentIds: discovered };
    });
    return discovered;
  },

  select: (id) => set({ selectedId: id, selectedIds: id ? [id] : [], selectedEdgeId: null }),

  toggleSelect: (id, shift) =>
    set((state) => {
      const selectedIds = shift
        ? state.selectedIds.includes(id)
          ? state.selectedIds.filter((x) => x !== id)
          : state.selectedIds.concat([id])
        : state.selectedIds.length === 1 && state.selectedIds[0] === id
          ? []
          : [id];
      return { selectedIds, selectedId: selectedIds[0] ?? null, selectedEdgeId: null };
    }),

  selectEdge: (id) => set({ selectedEdgeId: id, selectedIds: [], selectedId: null }),

  clearRecent: () => set({ recentIds: [] }),
  reset: () =>
    set({
      nodesById: {},
      relsById: {},
      recentIds: [],
      selectedId: null,
      selectedIds: [],
      selectedEdgeId: null,
    }),
}));

/** Stable-ish GraphPayload snapshot for passing straight into GraphCanvas. */
export function useTeamGraphPayload(): GraphPayload {
  const nodesById = useGraphStore((s) => s.nodesById);
  const relsById = useGraphStore((s) => s.relsById);
  return useMemo(
    () => ({ nodes: Object.values(nodesById), relationships: Object.values(relsById) }),
    [nodesById, relsById],
  );
}
