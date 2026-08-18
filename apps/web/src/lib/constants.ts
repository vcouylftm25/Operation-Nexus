import type { ToolName } from "./types";

/** In-memory mock credentials — JoinRoute uses these when VITE_MOCK=true. */
export const MOCK_JOIN_CODE = "NEXUS7";
export const MOCK_HOST_TOKEN = "mock-host-token";
export const MOCK_GAME_ID = "game_mock_01";
export const MOCK_TEAM_NAME = "Equipe Alfa";
export const DEFAULT_SCENARIO_SLUG = "operation_nexus";

/**
 * Credit costs per tool (CONTRACT.md §4). `expand_neighborhood` is
 * hop-dependent; use `expandNeighborhoodCost(hops)` for that one.
 */
export const TOOL_COSTS: Record<Exclude<ToolName, "expand_neighborhood">, number> = {
  inspect_entity: 5,
  find_shared_entities: 10,
  find_path: 15,
  timeline: 10,
  semantic_evidence_search: 20,
  challenge_hypothesis: 25,
};

export function expandNeighborhoodCost(hops: 1 | 2): number {
  return hops === 1 ? 15 : 20;
}

/** CONTRACT.md §4 hard caps. */
export const MAX_HOPS = 4;
export const MAX_TOP_K = 10;
export const MAX_ENTITY_IDS = 8;
export const MAX_TOOL_CALLS_PER_INTERACTION = 2;

/** CONTRACT.md §7 — join codes exclude these visually-ambiguous characters. */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 6;
