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
  selectedId: string | null;
  merge: (payload: GraphPayload) => string[];
  select: (id: string | null) => void;
  clearRecent: () => void;
  reset: () => void;
}

export const useGraphStore = create<GraphStoreState>((set) => ({
  nodesById: {},
  relsById: {},
  recentIds: [],
  selectedId: null,

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

  select: (id) => set({ selectedId: id }),
  clearRecent: () => set({ recentIds: [] }),
  reset: () => set({ nodesById: {}, relsById: {}, recentIds: [], selectedId: null }),
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
