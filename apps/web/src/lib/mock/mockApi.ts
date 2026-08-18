/**
 * In-memory implementation of every function `src/lib/api.ts` exports, so
 * `VITE_MOCK=true` runs the whole frontend with no backend at all.
 *
 * It reproduces the rules the UI has to cope with — resume by name, one-way
 * phases, hint prices, the 402 on an unaffordable purchase, three guess
 * attempts, the ranking order — because those rules are exactly what the
 * screens are built around. Errors are thrown as the same `ApiError` the real
 * client throws, with the same status codes and bodies.
 */
import { MOCK_GAME_ID, MOCK_TEAM_NAME, TOOL_COSTS, expandNeighborhoodCost } from "../constants";
import { ApiError } from "../api";
import {
  MAX_GUESS_ATTEMPTS,
  type AdvancePhaseResponse,
  type BuyHintResponse,
  type CaseFile,
  type GameState,
  type GameStatus,
  type GraphPayload,
  type GuessResult,
  type HintCard,
  type InvestigationIntent,
  type InvestigationResult,
  type LeaderboardRow,
  type RoundState,
  type StartPlayResponse,
  type Suspect,
  type TeamState,
  type TeamStatus,
  type ToolName,
} from "../types";
import { mockBroadcast } from "./mockWs";
import {
  BEATS,
  ENTITIES,
  GROUND_TRUTH,
  HINTS,
  RELATIONSHIPS,
  ROUNDS,
  SCENARIO_SLUG,
  entityById,
  relationshipById,
  toGraphNode,
  toGraphRelationship,
  type ScenarioBeat,
  type ScenarioEntity,
  type ScenarioRelationship,
} from "./scenario";

export { MOCK_GAME_ID, MOCK_TEAM_NAME };

const MIN_TEAM_NAME_LENGTH = 2;
const MAX_TEAM_NAME_LENGTH = 40;

/** Mirrors domain/game/ranking.py so mock scores read like real ones. */
const SOLVE_BASE_POINTS = 1000;
const WRONG_GUESS_PENALTY = 150;
const HINT_PENALTY = 25;

interface MockTeam {
  team_id: string;
  name: string;
  session_token: string;
  current_round: number;
  credits_balance: number;
  credits_total_awarded: number;
  status: TeamStatus;
  attempts_used: number;
  started_at: string;
  solved_at: string | null;
  discoveredNodeIds: Set<string>;
  discoveredRelIds: Set<string>;
  usedBeatIndexes: Set<number>;
  purchasedHintIds: Set<string>;
  guessedPersonIds: Set<string>;
  wrongGuesses: number;
}

interface MockGame {
  game_id: string;
  status: GameStatus;
  created_at: string;
  finished_at: string | null;
  rounds: RoundState[];
  teams: Map<string, MockTeam>;
}

let teamCounter = 0;

function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function makeTeam(name: string, startedAt = new Date().toISOString()): MockTeam {
  teamCounter += 1;
  const team_id = `team_mock_${String(teamCounter).padStart(2, "0")}`;
  return {
    team_id,
    name,
    session_token: `mock-session-${team_id}`,
    current_round: 1,
    credits_balance: ROUNDS[0].credits,
    credits_total_awarded: ROUNDS[0].credits,
    status: "PLAYING",
    attempts_used: 0,
    started_at: startedAt,
    solved_at: null,
    discoveredNodeIds: new Set(),
    discoveredRelIds: new Set(),
    usedBeatIndexes: new Set(),
    purchasedHintIds: new Set(),
    guessedPersonIds: new Set(),
    wrongGuesses: 0,
  };
}

function initialRounds(): RoundState[] {
  return ROUNDS.map((round) => ({
    game_id: MOCK_GAME_ID,
    number: round.number,
    credits_awarded: round.credits,
    title: round.title,
    narrative: round.narrative,
    duration_seconds: round.duration_seconds,
  }));
}

/**
 * Rival teams so the projector has a ranking to show and a solo developer can
 * see where their own team lands.
 */
function seedRivals(game: MockGame): void {
  const start = Date.now() - 40 * 60_000;

  const solved = makeTeam("Os Auditores", new Date(start).toISOString());
  solved.current_round = ROUNDS.length;
  solved.status = "SOLVED";
  solved.attempts_used = 2;
  solved.wrongGuesses = 1;
  solved.credits_balance = 95;
  solved.credits_total_awarded = 360;
  solved.purchasedHintIds = new Set(["hint_r1_02"]);
  solved.solved_at = new Date(start + 26 * 60_000).toISOString();

  const playing = makeTeam("Mesa 4", new Date(start + 6 * 60_000).toISOString());
  playing.current_round = 2;
  playing.credits_balance = 140;
  playing.credits_total_awarded = 220;

  game.teams.set(solved.team_id, solved);
  game.teams.set(playing.team_id, playing);
}

function freshGame(): MockGame {
  teamCounter = 0;
  const created: MockGame = {
    game_id: MOCK_GAME_ID,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    finished_at: null,
    rounds: initialRounds(),
    teams: new Map(),
  };
  seedRivals(created);
  return created;
}

let game: MockGame = freshGame();

export function resetMockState(): void {
  game = freshGame();
}

function apiError(status: number, body: Record<string, unknown>): ApiError<Record<string, unknown>> {
  const detail = typeof body.detail === "string" ? body.detail : undefined;
  return new ApiError(status, body, detail);
}

function notFound(detail: string): ApiError<Record<string, unknown>> {
  return apiError(404, { error: "NOT_FOUND", detail });
}

function requireTeam(teamId: string, bearerToken: string): MockTeam {
  const team = game.teams.get(teamId);
  if (!team) throw notFound(`Unknown team_id ${teamId}`);
  if (team.session_token !== bearerToken) {
    throw apiError(401, { error: "UNAUTHORIZED", detail: "Invalid session token" });
  }
  return team;
}

function requireGame(gameId: string): MockGame {
  if (gameId !== game.game_id) throw notFound(`Unknown game_id ${gameId}`);
  return game;
}

function finalRound(): number {
  return game.rounds.length || 1;
}

function toTeamState(team: MockTeam): TeamState {
  return {
    team_id: team.team_id,
    game_id: game.game_id,
    name: team.name,
    current_round: team.current_round,
    credits_balance: team.credits_balance,
    credits_total_awarded: team.credits_total_awarded,
    status: team.status,
    attempts_used: team.attempts_used,
    started_at: team.started_at,
    solved_at: team.solved_at,
    discovered_node_ids: [...team.discoveredNodeIds],
    discovered_relationship_ids: [...team.discoveredRelIds],
  };
}

function toGameState(): GameState {
  return {
    game_id: game.game_id,
    scenario_slug: SCENARIO_SLUG,
    status: game.status,
    created_at: game.created_at,
    finished_at: game.finished_at,
    rounds: game.rounds,
    teams: [...game.teams.values()].map(toTeamState),
  };
}

function teamScore(team: MockTeam): number {
  if (team.status !== "SOLVED") return 0;
  return Math.max(
    0,
    SOLVE_BASE_POINTS -
      WRONG_GUESS_PENALTY * team.wrongGuesses -
      HINT_PENALTY * team.purchasedHintIds.size +
      team.credits_balance,
  );
}

function elapsedSeconds(team: MockTeam): number | null {
  if (team.solved_at === null) return null;
  return Math.max(0, Math.round((Date.parse(team.solved_at) - Date.parse(team.started_at)) / 1000));
}

function visibleAt(round: number): { nodes: ScenarioEntity[]; rels: ScenarioRelationship[] } {
  const nodes = ENTITIES.filter((e) => e.visible_from_round <= round);
  const ids = new Set(nodes.map((n) => n.id));
  const rels = RELATIONSHIPS.filter(
    (r) => r.visible_from_round <= round && ids.has(r.start_id) && ids.has(r.end_id),
  );
  return { nodes, rels };
}

function payloadFrom(nodeIds: Iterable<string>, relIds: Iterable<string>): GraphPayload {
  const nodes = [...new Set(nodeIds)]
    .map((id) => entityById(id))
    .filter((e): e is ScenarioEntity => !!e)
    .map(toGraphNode);
  const relationships = [...new Set(relIds)]
    .map((id) => relationshipById(id))
    .filter((r): r is ScenarioRelationship => !!r)
    .map(toGraphRelationship);
  return { nodes, relationships };
}

function teamGraphPayload(team: MockTeam): GraphPayload {
  return payloadFrom(team.discoveredNodeIds, team.discoveredRelIds);
}

function recordDiscoveries(team: MockTeam, newNodeIds: string[], newRelIds: string[]): void {
  for (const id of newNodeIds) team.discoveredNodeIds.add(id);
  for (const id of newRelIds) team.discoveredRelIds.add(id);
}

function neighbors(id: string, rels: ScenarioRelationship[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const rel of rels) {
    if (rel.start_id === id) out.set(rel.end_id, rel.id);
    if (rel.end_id === id) out.set(rel.start_id, rel.id);
  }
  return out;
}

function neighborhood(
  startId: string,
  hops: number,
  rels: ScenarioRelationship[],
): { nodeIds: Set<string>; relIds: Set<string> } {
  const nodeIds = new Set<string>([startId]);
  const relIds = new Set<string>();
  let frontier = [startId];
  for (let h = 0; h < hops; h += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const [nid, rid] of neighbors(id, rels)) {
        relIds.add(rid);
        if (!nodeIds.has(nid)) {
          nodeIds.add(nid);
          next.push(nid);
        }
      }
    }
    frontier = next;
  }
  return { nodeIds, relIds };
}

function shortestPath(
  fromId: string,
  toId: string,
  rels: ScenarioRelationship[],
): { nodeIds: string[]; relIds: string[] } | null {
  if (fromId === toId) return { nodeIds: [fromId], relIds: [] };
  const queue: string[] = [fromId];
  const prev = new Map<string, { node: string; rel: string }>();
  const seen = new Set<string>([fromId]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const [nid, rid] of neighbors(current, rels)) {
      if (seen.has(nid)) continue;
      seen.add(nid);
      prev.set(nid, { node: current, rel: rid });
      if (nid === toId) {
        const nodeIds = [toId];
        const relIds: string[] = [];
        let cursor = toId;
        while (cursor !== fromId) {
          const step = prev.get(cursor);
          if (!step) return null;
          relIds.push(step.rel);
          nodeIds.push(step.node);
          cursor = step.node;
        }
        return { nodeIds: nodeIds.reverse(), relIds: relIds.reverse() };
      }
      queue.push(nid);
    }
  }
  return null;
}

type DslCommand =
  | { kind: "inspect"; entityId: string }
  | { kind: "shared"; ids: string[] }
  | { kind: "path"; fromId: string; toId: string }
  | { kind: "expand"; entityId: string; hops: 1 | 2 }
  | { kind: "timeline"; entityId: string }
  | { kind: "search"; query: string }
  | { kind: "challenge"; hypothesis: string; ids: string[] };

function parseDsl(question: string): DslCommand | null {
  const trimmed = question.trim();
  if (!trimmed.startsWith("/")) return null;
  const space = trimmed.indexOf(" ");
  const cmd = (space === -1 ? trimmed.slice(1) : trimmed.slice(1, space)).toLowerCase();
  const arg = space === -1 ? "" : trimmed.slice(space + 1).trim();

  switch (cmd) {
    case "inspect":
      return arg ? { kind: "inspect", entityId: arg.split(/\s+/)[0] ?? arg } : null;
    case "shared":
      return {
        kind: "shared",
        ids: arg
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
    case "path": {
      const [fromId, toId] = arg.split(/\s+/);
      if (!fromId || !toId) return null;
      return { kind: "path", fromId, toId };
    }
    case "expand": {
      const [entityId, hopsRaw] = arg.split(/\s+/);
      if (!entityId) return null;
      const hops = hopsRaw === "2" ? 2 : 1;
      return { kind: "expand", entityId, hops };
    }
    case "timeline":
      return arg ? { kind: "timeline", entityId: arg.split(/\s+/)[0] ?? arg } : null;
    case "search":
      return arg ? { kind: "search", query: arg } : null;
    case "challenge": {
      const [hypothesis, idsRaw] = arg.split("|").map((s) => s.trim());
      if (!hypothesis) return null;
      return {
        kind: "challenge",
        hypothesis,
        ids: (idsRaw ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
    }
    default:
      return null;
  }
}

interface DslOutcome {
  intent: InvestigationIntent;
  tool: ToolName;
  args: Record<string, unknown>;
  cost: number;
  nodeIds: string[];
  relIds: string[];
  answer: string;
  caveats: string[];
  justification: string;
}

function runDsl(team: MockTeam, command: DslCommand): DslOutcome {
  const { nodes, rels } = visibleAt(team.current_round);
  const visibleIds = new Set(nodes.map((n) => n.id));

  const ensureVisible = (id: string): ScenarioEntity | null => {
    const entity = entityById(id);
    if (!entity) return null;
    if (!visibleIds.has(id)) return null;
    return entity;
  };

  switch (command.kind) {
    case "inspect": {
      const entity = ensureVisible(command.entityId);
      if (!entity) {
        return {
          intent: "ENTITY_LOOKUP",
          tool: "inspect_entity",
          args: { entity_id: command.entityId },
          cost: TOOL_COSTS.inspect_entity,
          nodeIds: [],
          relIds: [],
          answer: `Nenhuma entidade visível com id ${command.entityId} nesta fase.`,
          caveats: ["O id pode estar errado ou ainda não ter entrado no caso."],
          justification: "Inspeção pontual de entidade.",
        };
      }
      const { nodeIds, relIds } = neighborhood(entity.id, 1, rels);
      return {
        intent: "ENTITY_LOOKUP",
        tool: "inspect_entity",
        args: { entity_id: entity.id },
        cost: TOOL_COSTS.inspect_entity,
        nodeIds: [...nodeIds],
        relIds: [...relIds],
        answer: `${entity.label_display} (${entity.id}). ${summarizeProps(entity)}`,
        caveats: [],
        justification: "Inspeção pontual de entidade.",
      };
    }
    case "shared": {
      const ids = command.ids.filter((id) => visibleIds.has(id));
      const sets = ids.map((id) => new Set(neighbors(id, rels).keys()));
      const sharedNodes =
        sets.length === 0 ? [] : [...sets[0]].filter((nid) => sets.every((s) => s.has(nid)));
      const nodeIds = new Set<string>([...ids, ...sharedNodes]);
      const relIds = new Set<string>();
      for (const rel of rels) {
        if (ids.includes(rel.start_id) && sharedNodes.includes(rel.end_id)) relIds.add(rel.id);
        if (ids.includes(rel.end_id) && sharedNodes.includes(rel.start_id)) relIds.add(rel.id);
      }
      const labels = sharedNodes.map((id) => entityById(id)?.label_display ?? id).join(", ");
      return {
        intent: "CONNECTION_SEARCH",
        tool: "find_shared_entities",
        args: { entity_ids: ids },
        cost: TOOL_COSTS.find_shared_entities,
        nodeIds: [...nodeIds],
        relIds: [...relIds],
        answer:
          sharedNodes.length > 0
            ? `Entidades compartilhadas: ${labels}.`
            : "Nenhuma entidade compartilhada visível entre os ids informados.",
        caveats: [],
        justification: "Busca de pivôs compartilhados.",
      };
    }
    case "path": {
      const path = shortestPath(command.fromId, command.toId, rels);
      return {
        intent: "PATH_SEARCH",
        tool: "find_path",
        args: { from_id: command.fromId, to_id: command.toId, max_hops: 4 },
        cost: TOOL_COSTS.find_path,
        nodeIds: path?.nodeIds ?? [command.fromId, command.toId].filter((id) => visibleIds.has(id)),
        relIds: path?.relIds ?? [],
        answer: path
          ? `Caminho encontrado (${path.nodeIds.join(" → ")}).`
          : `Nenhum caminho visível entre ${command.fromId} e ${command.toId}.`,
        caveats: path ? [] : ["Ausência de caminho nesta fase não prova inocência."],
        justification: "Busca de caminho mais curto.",
      };
    }
    case "expand": {
      const { nodeIds, relIds } = neighborhood(command.entityId, command.hops, rels);
      return {
        intent: "NEIGHBORHOOD",
        tool: "expand_neighborhood",
        args: { entity_id: command.entityId, hops: command.hops },
        cost: expandNeighborhoodCost(command.hops),
        nodeIds: [...nodeIds],
        relIds: [...relIds],
        answer: `Vizinhança de ${command.entityId} em ${command.hops} salto(s): ${nodeIds.size} nós, ${relIds.size} relações.`,
        caveats: [],
        justification: "Expansão de vizinhança.",
      };
    }
    case "timeline": {
      const entity = ensureVisible(command.entityId);
      const { nodeIds, relIds } = neighborhood(command.entityId, 1, rels);
      const timed = [...relIds]
        .map((id) => relationshipById(id))
        .filter((r): r is ScenarioRelationship => !!r && !!r.timestamp)
        .sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
      const lines = timed.map((r) => `${r.timestamp}: ${r.type} (${r.id})`);
      return {
        intent: "TIMELINE",
        tool: "timeline",
        args: { entity_id: command.entityId },
        cost: TOOL_COSTS.timeline,
        nodeIds: [...nodeIds],
        relIds: [...relIds],
        answer:
          entity == null
            ? `Entidade ${command.entityId} não visível.`
            : lines.length > 0
              ? `Linha do tempo de ${entity.label_display}:\n${lines.join("\n")}`
              : `${entity.label_display} não tem eventos datados visíveis nesta fase.`,
        caveats: [],
        justification: "Linha do tempo da entidade.",
      };
    }
    case "search": {
      const q = command.query.toLowerCase();
      const hits = nodes.filter(
        (e) =>
          (e.label === "Evidence" || e.label === "Message") &&
          `${e.label_display} ${JSON.stringify(e.properties)}`.toLowerCase().includes(q),
      );
      const fallback = nodes.filter((e) => e.label === "Evidence" || e.label === "Message");
      const chosen = hits.length > 0 ? hits : fallback;
      const nodeIds = new Set(chosen.map((e) => e.id));
      const relIds = new Set<string>();
      for (const rel of rels) {
        if (nodeIds.has(rel.start_id) || nodeIds.has(rel.end_id)) {
          relIds.add(rel.id);
          nodeIds.add(rel.start_id);
          nodeIds.add(rel.end_id);
        }
      }
      return {
        intent: "SEMANTIC_SEARCH",
        tool: "semantic_evidence_search",
        args: { query: command.query, top_k: 5 },
        cost: TOOL_COSTS.semantic_evidence_search,
        nodeIds: [...nodeIds],
        relIds: [...relIds],
        answer:
          chosen.length > 0
            ? `Material encontrado: ${chosen.map((e) => e.label_display).join("; ")}.`
            : "Nenhuma evidência ou mensagem visível corresponde à busca.",
        caveats: ["Busca semântica no mock é lexical — no motor real usa embeddings."],
        justification: "Busca em evidências e mensagens.",
      };
    }
    case "challenge": {
      const ids = command.ids.filter((id) => visibleIds.has(id));
      const nodeIds = new Set(ids);
      const relIds = new Set<string>();
      for (const id of ids) {
        const n = neighborhood(id, 1, rels);
        for (const nid of n.nodeIds) nodeIds.add(nid);
        for (const rid of n.relIds) relIds.add(rid);
      }
      const isolated = ids.filter((id) => neighborhood(id, 1, rels).nodeIds.size <= 1);
      return {
        intent: "HYPOTHESIS_CHALLENGE",
        tool: "challenge_hypothesis",
        args: { hypothesis: command.hypothesis, entity_ids: ids },
        cost: TOOL_COSTS.challenge_hypothesis,
        nodeIds: [...nodeIds],
        relIds: [...relIds],
        answer: `Contraponto à hipótese «${command.hypothesis}»: ${
          isolated.length > 0
            ? `${isolated.join(", ")} aparece(m) isolado(s) no recorte visível — isso enfraquece a tese, não a confirma.`
            : "há conexões visíveis, mas conexões não são veredicto. Procure evidência direta e o fluxo de dinheiro."
        }`,
        caveats: ["challenge_hypothesis nunca confirma culpa — só devolve contra-evidência."],
        justification: "Desafio de hipótese.",
      };
    }
  }
}

function summarizeProps(entity: ScenarioEntity): string {
  const props = entity.properties;
  const bits: string[] = [];
  if (typeof props.name === "string") bits.push(props.name);
  if (typeof props.occupation === "string") bits.push(props.occupation);
  if (typeof props.status === "string") bits.push(`status ${props.status}`);
  if (typeof props.bank === "string") bits.push(props.bank);
  if (typeof props.content === "string") bits.push(`«${props.content}»`);
  return bits.join(" · ");
}

function pickBeat(team: MockTeam, question: string): ScenarioBeat | null {
  const eligible = BEATS.map((b, index) => ({ b, index })).filter(
    ({ b, index }) => b.minRound <= team.current_round && !team.usedBeatIndexes.has(index),
  );
  if (eligible.length === 0) return null;

  const q = question.toLowerCase();
  const keywordMatch = eligible.find(({ b }) => b.keywords.some((k) => q.includes(k)));
  const chosen = keywordMatch ?? eligible[0];
  team.usedBeatIndexes.add(chosen.index);
  return chosen.b;
}

function toolArguments(beat: ScenarioBeat): Record<string, unknown> {
  switch (beat.tool) {
    case "inspect_entity":
      return { entity_id: beat.nodeIds[0] };
    case "find_shared_entities":
      return { entity_ids: beat.nodeIds };
    case "find_path":
      return { from_id: beat.nodeIds[0], to_id: beat.nodeIds[beat.nodeIds.length - 1], max_hops: 4 };
    case "expand_neighborhood":
      return { entity_id: beat.nodeIds[0], hops: 1 };
    case "timeline":
      return { entity_id: beat.nodeIds[0] };
    case "semantic_evidence_search":
      return { query: beat.answer, top_k: 5 };
    case "challenge_hypothesis":
      return { hypothesis: beat.answer, entity_ids: beat.nodeIds };
  }
}

function chargeOrThrow(team: MockTeam, cost: number): void {
  if (team.credits_balance < cost) {
    throw new ApiError(402, {
      error: "INSUFFICIENT_CREDITS",
      required: cost,
      available: team.credits_balance,
    });
  }
  team.credits_balance -= cost;
}

function applyDiscovery(
  team: MockTeam,
  nodeIds: string[],
  relIds: string[],
  actionId: string,
): { newNodeIds: string[]; newRelIds: string[] } {
  const newNodeIds = nodeIds.filter((id) => entityById(id) && !team.discoveredNodeIds.has(id));
  const newRelIds = relIds.filter((id) => relationshipById(id) && !team.discoveredRelIds.has(id));
  recordDiscoveries(team, newNodeIds, newRelIds);
  if (newNodeIds.length > 0 || newRelIds.length > 0) {
    // One envelope for both audiences: two broadcasts would burn two `seq`
    // numbers and make each socket think it missed a message.
    mockBroadcast(
      game.game_id,
      "GRAPH_DISCOVERY",
      {
        team_id: team.team_id,
        discovered: payloadFrom(newNodeIds, newRelIds),
        source_action_id: actionId,
      },
      { teamToken: team.session_token },
    );
  }
  return { newNodeIds, newRelIds };
}

function emptyResult(
  team: MockTeam,
  question: string,
  actionId: string,
  answer: string,
): InvestigationResult {
  return {
    action_id: actionId,
    question,
    plan: { intent: "OUT_OF_SCOPE", tool_calls: [], reasoning_summary: answer },
    answer: {
      answer,
      evidence_ids: [],
      discovered_node_ids: [],
      discovered_relationship_ids: [],
      caveats: [],
    },
    subgraph: { nodes: [], relationships: [] },
    credits_charged: 0,
    credits_remaining: team.credits_balance,
  };
}

// ---------------------------------------------------------------------------
// Public surface — mirrors src/lib/api.ts one for one
// ---------------------------------------------------------------------------

export async function startPlay(teamName: string): Promise<StartPlayResponse> {
  const name = (teamName ?? "").replace(/\s+/g, " ").trim();
  if (name.length < MIN_TEAM_NAME_LENGTH) {
    throw apiError(422, {
      error: "INVALID_TEAM_NAME",
      detail: `team name must have at least ${MIN_TEAM_NAME_LENGTH} characters`,
    });
  }
  if (name.length > MAX_TEAM_NAME_LENGTH) {
    throw apiError(422, {
      error: "INVALID_TEAM_NAME",
      detail: `team name must have at most ${MAX_TEAM_NAME_LENGTH} characters`,
    });
  }

  const existing = [...game.teams.values()].find((team) => nameKey(team.name) === nameKey(name));
  const team = existing ?? makeTeam(name);
  if (!existing) game.teams.set(team.team_id, team);

  return {
    team: toTeamState(team),
    session_token: team.session_token,
    resumed: existing !== undefined,
    rounds: game.rounds,
  };
}

export async function getGame(gameId: string): Promise<GameState> {
  requireGame(gameId);
  return toGameState();
}

export async function getLeaderboard(gameId: string): Promise<LeaderboardRow[]> {
  requireGame(gameId);
  const rows: LeaderboardRow[] = [...game.teams.values()].map((team) => ({
    team_id: team.team_id,
    team_name: team.name,
    status: team.status,
    score: teamScore(team),
    attempts_used: team.attempts_used,
    elapsed_seconds: elapsedSeconds(team),
    current_round: team.current_round,
  }));
  // Same order as domain/game/ranking.rank: solvers first, then score, and
  // time only as a tie-break.
  return rows.sort((a, b) => {
    const solvedFirst = (a.status === "SOLVED" ? 0 : 1) - (b.status === "SOLVED" ? 0 : 1);
    if (solvedFirst !== 0) return solvedFirst;
    if (a.score !== b.score) return b.score - a.score;
    const ea = a.elapsed_seconds ?? Number.MAX_SAFE_INTEGER;
    const eb = b.elapsed_seconds ?? Number.MAX_SAFE_INTEGER;
    if (ea !== eb) return ea - eb;
    return a.team_name.localeCompare(b.team_name, "pt-BR");
  });
}

export async function getTeamState(teamId: string, bearerToken: string): Promise<TeamState> {
  return toTeamState(requireTeam(teamId, bearerToken));
}

export async function advancePhase(
  teamId: string,
  bearerToken: string,
): Promise<AdvancePhaseResponse> {
  const team = requireTeam(teamId, bearerToken);
  if (team.status !== "PLAYING") {
    throw apiError(409, {
      error: "RUN_ALREADY_RESOLVED",
      detail: `team ${teamId} has finished its run (${team.status})`,
    });
  }
  const target = team.current_round + 1;
  if (target > finalRound()) {
    throw apiError(409, {
      error: "NO_FURTHER_PHASE",
      detail: `already in the final phase (${team.current_round})`,
    });
  }

  const briefing = game.rounds[target - 1];
  team.current_round = target;
  team.credits_balance += briefing.credits_awarded;
  team.credits_total_awarded += briefing.credits_awarded;

  mockBroadcast(
    game.game_id,
    "PHASE_ADVANCED",
    { team_id: team.team_id, round: team.current_round, credits_balance: team.credits_balance },
    { teamToken: team.session_token },
  );

  return { team: toTeamState(team), briefing };
}

export async function getHints(teamId: string, bearerToken: string): Promise<HintCard[]> {
  const team = requireTeam(teamId, bearerToken);
  return HINTS.filter((hint) => hint.round <= team.current_round).map((hint) => {
    const purchased = team.purchasedHintIds.has(hint.id);
    return {
      id: hint.id,
      round: hint.round,
      cost: hint.cost,
      title: hint.title,
      purchased,
      text: purchased ? hint.text : null,
    };
  });
}

export async function buyHint(
  teamId: string,
  hintId: string,
  bearerToken: string,
): Promise<BuyHintResponse> {
  const team = requireTeam(teamId, bearerToken);
  const hint = HINTS.find((item) => item.id === hintId);
  if (!hint) throw apiError(404, { error: "HINT_NOT_FOUND", detail: `unknown hint: ${hintId}` });
  if (hint.round > team.current_round) {
    throw apiError(409, {
      error: "HINT_LOCKED",
      detail: `hint ${hintId} belongs to phase ${hint.round}; team is in phase ${team.current_round}`,
    });
  }

  if (!team.purchasedHintIds.has(hint.id)) {
    chargeOrThrow(team, hint.cost);
    team.purchasedHintIds.add(hint.id);
  }

  return {
    hint: {
      id: hint.id,
      round: hint.round,
      cost: hint.cost,
      title: hint.title,
      purchased: true,
      text: hint.text,
    },
    credits_balance: team.credits_balance,
  };
}

export async function getSuspects(teamId: string, bearerToken: string): Promise<Suspect[]> {
  const team = requireTeam(teamId, bearerToken);
  return ENTITIES.filter(
    (entity) => entity.label === "Person" && entity.visible_from_round <= team.current_round,
  )
    .map((entity) => ({
      id: entity.id,
      name: entity.label_display,
      already_guessed: team.guessedPersonIds.has(entity.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function submitGuess(
  teamId: string,
  personId: string,
  bearerToken: string,
): Promise<GuessResult> {
  const team = requireTeam(teamId, bearerToken);
  if (team.status !== "PLAYING") {
    throw apiError(409, {
      error: "RUN_ALREADY_RESOLVED",
      detail: `team ${teamId} has finished its run (${team.status})`,
    });
  }
  if (team.attempts_used >= MAX_GUESS_ATTEMPTS) {
    throw apiError(409, {
      error: "NO_ATTEMPTS_REMAINING",
      detail: `team ${teamId} has no guess attempts left`,
    });
  }
  if (team.current_round < finalRound()) {
    throw apiError(409, {
      error: "GUESS_LOCKED",
      detail: `guessing unlocks in phase ${finalRound()}; team is in phase ${team.current_round}`,
      required_round: finalRound(),
    });
  }
  const suspect = ENTITIES.find((entity) => entity.label === "Person" && entity.id === personId);
  if (!suspect) {
    throw apiError(422, {
      error: "UNKNOWN_SUSPECT",
      detail: `not a suspect in this case: ${personId}`,
    });
  }

  const correct = personId === GROUND_TRUTH.coordinator;
  team.attempts_used += 1;
  team.guessedPersonIds.add(personId);
  if (correct) {
    team.status = "SOLVED";
    team.solved_at = new Date().toISOString();
  } else {
    team.wrongGuesses += 1;
    if (team.attempts_used >= MAX_GUESS_ATTEMPTS) team.status = "FAILED";
  }

  const score = teamScore(team);
  mockBroadcast(
    game.game_id,
    "LEADERBOARD_CHANGED",
    { team_id: team.team_id, team_name: team.name, status: team.status, score },
    {},
  );

  return {
    correct,
    attempts_used: team.attempts_used,
    attempts_remaining: Math.max(0, MAX_GUESS_ATTEMPTS - team.attempts_used),
    status: team.status,
    elapsed_seconds:
      elapsedSeconds(team) ??
      Math.max(0, Math.round((Date.now() - Date.parse(team.started_at)) / 1000)),
    score,
  };
}

export async function investigate(
  teamId: string,
  question: string,
  bearerToken: string,
): Promise<InvestigationResult> {
  const team = requireTeam(teamId, bearerToken);
  const actionId = crypto.randomUUID();
  const dsl = parseDsl(question);

  if (dsl) {
    const outcome = runDsl(team, dsl);
    chargeOrThrow(team, outcome.cost);
    const { newNodeIds, newRelIds } = applyDiscovery(team, outcome.nodeIds, outcome.relIds, actionId);
    const evidenceIds = outcome.nodeIds.filter((id) => {
      const e = entityById(id);
      return e?.label === "Evidence" || e?.label === "Message";
    });
    return {
      action_id: actionId,
      question,
      plan: {
        intent: outcome.intent,
        tool_calls: [
          { tool: outcome.tool, arguments: outcome.args, justification: outcome.justification },
        ],
        reasoning_summary: outcome.answer,
      },
      answer: {
        answer: outcome.answer,
        evidence_ids: evidenceIds,
        discovered_node_ids: newNodeIds,
        discovered_relationship_ids: newRelIds,
        caveats: outcome.caveats,
      },
      subgraph: payloadFrom(outcome.nodeIds, outcome.relIds),
      credits_charged: outcome.cost,
      credits_remaining: team.credits_balance,
    };
  }

  const beat = pickBeat(team, question);
  if (!beat) {
    return emptyResult(
      team,
      question,
      actionId,
      "Todos os indícios disponíveis nesta fase já foram revelados. Avancem para a próxima fase.",
    );
  }

  chargeOrThrow(team, beat.cost);
  const { newNodeIds, newRelIds } = applyDiscovery(team, beat.nodeIds, beat.relationshipIds, actionId);

  const involvedNodeIds = new Set(beat.nodeIds);
  for (const relId of beat.relationshipIds) {
    const rel = relationshipById(relId);
    if (rel) {
      involvedNodeIds.add(rel.start_id);
      involvedNodeIds.add(rel.end_id);
    }
  }

  const evidenceIds = beat.nodeIds.filter((id) => {
    const e = entityById(id);
    return e?.label === "Evidence" || e?.label === "Message";
  });

  return {
    action_id: actionId,
    question,
    plan: {
      intent: beat.intent,
      tool_calls: [
        {
          tool: beat.tool,
          arguments: toolArguments(beat),
          justification: `Etapa da investigação: ${beat.intent.toLowerCase().replaceAll("_", " ")}.`,
        },
      ],
      reasoning_summary: beat.answer,
    },
    answer: {
      answer: beat.answer,
      evidence_ids: evidenceIds,
      discovered_node_ids: newNodeIds,
      discovered_relationship_ids: newRelIds,
      caveats: beat.caveats,
    },
    subgraph: payloadFrom(involvedNodeIds, beat.relationshipIds),
    credits_charged: beat.cost,
    credits_remaining: team.credits_balance,
  };
}

export async function getTeamGraph(teamId: string, bearerToken: string): Promise<GraphPayload> {
  return teamGraphPayload(requireTeam(teamId, bearerToken));
}

export async function getDocket(teamId: string, bearerToken: string): Promise<CaseFile[]> {
  const team = requireTeam(teamId, bearerToken);
  const files: CaseFile[] = ENTITIES.filter(
    (entity) =>
      (entity.label === "Person" || entity.label === "Application") &&
      entity.visible_from_round <= team.current_round,
  ).map((entity) => {
    const score = entity.properties.credit_score;
    const income = entity.properties.income_declared;
    const age = entity.properties.age;
    const amount = entity.properties.amount;
    return {
      id: entity.id,
      labels: [entity.label],
      label_display: entity.label_display,
      occupation:
        typeof entity.properties.occupation === "string" ? entity.properties.occupation : null,
      credit_score: typeof score === "number" ? score : null,
      income_declared: typeof income === "number" ? income : null,
      age: typeof age === "number" ? age : null,
      amount: typeof amount === "number" ? amount : null,
      product: typeof entity.properties.product === "string" ? entity.properties.product : null,
      status: typeof entity.properties.status === "string" ? entity.properties.status : null,
    };
  });
  files.sort((a, b) => {
    const rank = (row: CaseFile) => (row.labels.includes("Person") ? 0 : 1);
    return rank(a) - rank(b) || a.label_display.localeCompare(b.label_display);
  });
  return files;
}

export async function health(): Promise<{ status: string }> {
  return { status: "ok" };
}

export async function healthDeep(): Promise<Record<string, unknown>> {
  return { status: "ok", mode: "mock", teams: game.teams.size };
}

export { ENTITIES as MOCK_ENTITIES, RELATIONSHIPS as MOCK_RELATIONSHIPS, ROUNDS as MOCK_ROUNDS };
