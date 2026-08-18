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
import {
  readClassification,
  writeClassification,
  type Classification,
  type ClassificationMap,
} from "./classification";

interface GraphStoreState {
  nodesById: Record<string, GraphNode>;
  relsById: Record<string, GraphRelationship>;
  /** ids (node or relationship) introduced by the most recent merge() call. */
  recentIds: string[];
  /**
   * The team's own marks on nodes *and* edges, keyed by id (one map for both —
   * ids are unique across the payload). Player hypothesis only: it is never
   * sent to the API and never checked against the answer. See ./classification.
   */
  classification: ClassificationMap;
  /** Team the marks belong to; also the localStorage partition key. */
  teamId: string | null;
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
  /** Loads the team's saved marks; call once the session's team is known. */
  bindTeam: (teamId: string) => void;
  /** Re-marking with the value already on the id clears it. */
  classify: (id: string, value: Classification | null) => void;
}

export const useGraphStore = create<GraphStoreState>((set) => ({
  nodesById: {},
  relsById: {},
  recentIds: [],
  selectedId: null,
  selectedIds: [],
  selectedEdgeId: null,
  classification: {},
  teamId: null,

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

  // Wipes the in-memory board only: what is on disk belongs to the team, and
  // /play resets the store on every mount before re-binding the team.
  reset: () =>
    set({
      nodesById: {},
      relsById: {},
      recentIds: [],
      selectedId: null,
      selectedIds: [],
      selectedEdgeId: null,
      classification: {},
      teamId: null,
    }),

  bindTeam: (teamId) => set({ teamId, classification: readClassification(teamId) }),

  classify: (id, value) =>
    set((state) => {
      const next = { ...state.classification };
      if (value === null || next[id] === value) delete next[id];
      else next[id] = value;
      if (state.teamId) writeClassification(state.teamId, next);
      return { classification: next };
    }),
}));

export interface ClassificationCounts {
  suspect: number;
  uncertain: number;
  explained: number;
}

export function useClassificationCounts(): ClassificationCounts {
  const classification = useGraphStore((s) => s.classification);
  return useMemo(() => {
    const counts: ClassificationCounts = { suspect: 0, uncertain: 0, explained: 0 };
    for (const value of Object.values(classification)) counts[value] += 1;
    return counts;
  }, [classification]);
}

/** Stable-ish GraphPayload snapshot for passing straight into GraphCanvas. */
export function useTeamGraphPayload(): GraphPayload {
  const nodesById = useGraphStore((s) => s.nodesById);
  const relsById = useGraphStore((s) => s.relsById);
  return useMemo(
    () => ({ nodes: Object.values(nodesById), relationships: Object.values(relsById) }),
    [nodesById, relsById],
  );
}
