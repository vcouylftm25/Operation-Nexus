/**
 * In-memory implementation of every function `src/lib/api.ts` exports.
 * Drives `./scenario.ts` and broadcasts over `./mockWs.ts`.
 */
import {
  MOCK_GAME_ID,
  MOCK_HOST_TOKEN,
  MOCK_JOIN_CODE,
  MOCK_TEAM_NAME,
  TOOL_COSTS,
  expandNeighborhoodCost,
} from "../constants";
import { ApiError } from "../api";
import type {
  Accusation,
  CaseFile,
  CreateTeamResponse,
  FraudPattern,
  GameState,
  GameStatus,
  GraphPayload,
  InvestigationIntent,
  InvestigationResult,
  JoinTeamResponse,
  RoundState,
  RoundStatus,
  ScoreBreakdown,
  ScoreEvent,
  TeamState,
  ToolName,
} from "../types";
import { mockBroadcast } from "./mockWs";
import {
  BEATS,
  ENTITIES,
  GROUND_TRUTH,
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

export { MOCK_GAME_ID, MOCK_HOST_TOKEN, MOCK_JOIN_CODE, MOCK_TEAM_NAME };

interface MockTeam {
  team_id: string;
  name: string;
  session_token: string;
  join_code: string;
  current_round: number;
  credits_balance: number;
  credits_total_awarded: number;
  discoveredNodeIds: Set<string>;
  discoveredRelIds: Set<string>;
  usedBeatIndexes: Set<number>;
  roundsCreditGranted: Set<number>;
  scoreEvents: ScoreEvent[];
  totalScore: number;
  accusation: Accusation | null;
}

interface MockGame {
  game_id: string;
  status: GameStatus;
  current_round: number;
  created_at: string;
  finished_at: string | null;
  rounds: RoundState[];
  teams: Map<string, MockTeam>;
  joinCodeToTeamId: Map<string, string>;
}

let teamCounter = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let tickRemaining = 0;

function stopTicks(): void {
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function startTicks(round: number, durationSeconds: number): void {
  stopTicks();
  if (import.meta.env.MODE === "test") return;
  tickRemaining = durationSeconds;
  tickTimer = setInterval(() => {
    tickRemaining = Math.max(0, tickRemaining - 1);
    mockBroadcast(
      game.game_id,
      "TICK",
      { round, seconds_remaining: tickRemaining },
      {},
    );
    if (tickRemaining <= 0) stopTicks();
  }, 1000);
}

function makeTeam(name: string, joinCode: string): MockTeam {
  teamCounter += 1;
  const team_id = `team_mock_${String(teamCounter).padStart(2, "0")}`;
  return {
    team_id,
    name,
    session_token: `mock-session-${team_id}`,
    join_code: joinCode,
    current_round: 1,
    credits_balance: ROUNDS[0].credits,
    credits_total_awarded: ROUNDS[0].credits,
    discoveredNodeIds: new Set(),
    discoveredRelIds: new Set(),
    usedBeatIndexes: new Set(),
    roundsCreditGranted: new Set([1]),
    scoreEvents: [],
    totalScore: 0,
    accusation: null,
  };
}

function initialRounds(now: string): RoundState[] {
  return ROUNDS.map((r, index) => ({
    game_id: MOCK_GAME_ID,
    number: r.number,
    status: (index === 0 ? "ACTIVE" : "PENDING") as RoundStatus,
    credits_awarded: r.credits,
    title: r.title,
    narrative: r.narrative,
    duration_seconds: r.duration_seconds,
    started_at: index === 0 ? now : null,
    ended_at: null,
  }));
}

function freshGame(): MockGame {
  stopTicks();
  teamCounter = 0;
  const now = new Date().toISOString();
  const seedTeam = makeTeam(MOCK_TEAM_NAME, MOCK_JOIN_CODE);
  const teams = new Map([[seedTeam.team_id, seedTeam]]);
  const joinCodeToTeamId = new Map([[seedTeam.join_code, seedTeam.team_id]]);
  const created: MockGame = {
    game_id: MOCK_GAME_ID,
    status: "ACTIVE",
    current_round: 1,
    created_at: now,
    finished_at: null,
    rounds: initialRounds(now),
    teams,
    joinCodeToTeamId,
  };
  return created;
}

let game: MockGame = freshGame();

export function resetMockState(): void {
  game = freshGame();
}

function unauthorized(detail: string): ApiError<{ detail: string }> {
  return new ApiError(401, { detail });
}

function notFound(detail: string): ApiError<{ detail: string }> {
  return new ApiError(404, { detail });
}

function requireTeam(teamId: string, bearerToken: string): MockTeam {
  const team = game.teams.get(teamId);
  if (!team) throw notFound(`Unknown team_id ${teamId}`);
  if (team.session_token !== bearerToken) throw unauthorized("Invalid session token");
  return team;
}

function requireHost(hostToken: string): void {
  if (hostToken !== MOCK_HOST_TOKEN) throw unauthorized("Invalid host token");
}

function toTeamState(team: MockTeam): TeamState {
  return {
    team_id: team.team_id,
    game_id: game.game_id,
    name: team.name,
    join_code: team.join_code,
    current_round: team.current_round,
    credits_balance: team.credits_balance,
    credits_total_awarded: team.credits_total_awarded,
    discovered_node_ids: [...team.discoveredNodeIds],
    discovered_relationship_ids: [...team.discoveredRelIds],
  };
}

function toGameState(): GameState {
  return {
    game_id: game.game_id,
    scenario_slug: SCENARIO_SLUG,
    status: game.status,
    current_round: game.current_round,
    created_at: game.created_at,
    finished_at: game.finished_at,
    rounds: game.rounds,
    teams: [...game.teams.values()].map(toTeamState),
  };
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
          answer: `Nenhuma entidade visível com id ${command.entityId} nesta rodada.`,
          caveats: ["O id pode estar errado ou ainda bloqueado."],
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
        sets.length === 0
          ? []
          : [...sets[0]].filter((nid) => sets.every((s) => s.has(nid)));
      const nodeIds = new Set<string>([...ids, ...sharedNodes]);
      const relIds = new Set<string>();
      for (const rel of rels) {
        if (ids.includes(rel.start_id) && sharedNodes.includes(rel.end_id)) relIds.add(rel.id);
        if (ids.includes(rel.end_id) && sharedNodes.includes(rel.start_id)) relIds.add(rel.id);
      }
      const labels = sharedNodes
        .map((id) => entityById(id)?.label_display ?? id)
        .join(", ");
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
        caveats: path ? [] : ["Ausência de caminho nesta rodada não prova inocência."],
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
              : `${entity.label_display} não tem eventos datados visíveis nesta rodada.`,
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
    const discoveryPayload = {
      team_id: team.team_id,
      discovered: payloadFrom(newNodeIds, newRelIds),
      source_action_id: actionId,
    };
    mockBroadcast(game.game_id, "GRAPH_DISCOVERY", discoveryPayload, {
      role: "team",
      teamToken: team.session_token,
    });
    mockBroadcast(game.game_id, "GRAPH_DISCOVERY", discoveryPayload, { role: "screen" });
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
    plan: {
      intent: "OUT_OF_SCOPE",
      tool_calls: [],
      reasoning_summary: answer,
    },
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

export async function createGame(_scenarioSlug: string): Promise<GameState> {
  game = freshGame();
  return toGameState();
}

export async function getGame(gameId: string): Promise<GameState> {
  if (gameId !== game.game_id) throw notFound(`Unknown game_id ${gameId}`);
  return toGameState();
}

function uniqueJoinCode(): string {
  let next = Math.random().toString(36).slice(2, 8).toUpperCase();
  while (game.joinCodeToTeamId.has(next)) {
    next = Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  return next;
}

export async function createTeam(gameId: string, name: string): Promise<CreateTeamResponse> {
  if (gameId !== game.game_id) throw notFound(`Unknown game_id ${gameId}`);
  const code = uniqueJoinCode();
  const team = makeTeam(name, code);
  team.current_round = Math.max(1, game.current_round);
  game.teams.set(team.team_id, team);
  game.joinCodeToTeamId.set(code, team.team_id);
  return { team_id: team.team_id, join_code: code };
}

export async function joinTeam(joinCode: string): Promise<JoinTeamResponse> {
  const teamId = game.joinCodeToTeamId.get(joinCode.toUpperCase());
  const team = teamId ? game.teams.get(teamId) : undefined;
  if (!team) throw notFound(`No team for join code ${joinCode}`);
  return {
    team_id: team.team_id,
    game_id: game.game_id,
    session_token: team.session_token,
  };
}

export async function getTeamState(teamId: string, bearerToken: string): Promise<TeamState> {
  return toTeamState(requireTeam(teamId, bearerToken));
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
          {
            tool: outcome.tool,
            arguments: outcome.args,
            justification: outcome.justification,
          },
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
      "Todos os indícios disponíveis nesta rodada já foram revelados. Aguarde a próxima rodada.",
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

function scoreAccusation(team: MockTeam, accusation: Accusation): ScoreEvent[] {
  const events: ScoreEvent[] = [];
  const push = (rule: string, delta: number, detail: string) => {
    events.push({ team_id: team.team_id, round: team.current_round, rule, delta, detail });
  };

  const accused = new Set(accusation.accused_person_ids);
  const fraudsters = new Set(GROUND_TRUTH.fraudsters);

  for (const id of accused) {
    if (fraudsters.has(id)) {
      push("correct_fraudster", 12, `${id} era de fato um fraudador.`);
    } else {
      push("legitimate_accused", -8, `${id} é uma pessoa legítima — acusação incorreta.`);
    }
  }

  if (accusation.coordinator_person_id === GROUND_TRUTH.coordinator) {
    push("correct_coordinator", 10, `${accusation.coordinator_person_id} é de fato o coordenador.`);
  }

  for (const relId of GROUND_TRUTH.key_relationships) {
    if (team.discoveredRelIds.has(relId)) {
      push("key_relationship", 20, `Relação-chave ${relId} foi descoberta pela equipe.`);
    }
  }

  for (const id of GROUND_TRUTH.designed_false_positives) {
    if (!accused.has(id)) {
      push("false_positive_avoided", 15, `${id} corretamente NÃO foi acusado.`);
    }
  }

  if (accusation.pattern === (GROUND_TRUTH.pattern as FraudPattern)) {
    push("correct_pattern", 10, `Padrão de fraude ${accusation.pattern} identificado corretamente.`);
  }

  const efficiency = Math.round(
    (10 * team.credits_balance) / Math.max(1, team.credits_total_awarded),
  );
  push(
    "credit_efficiency",
    efficiency,
    `${team.credits_balance}/${team.credits_total_awarded} créditos preservados.`,
  );

  return events;
}

export async function submitAccusation(
  teamId: string,
  accusation: Accusation,
  bearerToken: string,
): Promise<void> {
  const team = requireTeam(teamId, bearerToken);
  team.accusation = accusation;

  mockBroadcast(
    game.game_id,
    "ACCUSATION_SUBMITTED",
    { team_id: team.team_id, team_name: team.name },
    {},
  );

  const events = scoreAccusation(team, accusation);
  for (const event of events) {
    team.scoreEvents.push(event);
    team.totalScore += event.delta;
    mockBroadcast(
      game.game_id,
      "TEAM_SCORE_UPDATED",
      {
        team_id: team.team_id,
        team_name: team.name,
        total: team.totalScore,
        total_score: team.totalScore,
        event,
      },
      {},
    );
  }
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
      occupation: typeof entity.properties.occupation === "string" ? entity.properties.occupation : null,
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

function grantRoundCredits(team: MockTeam, roundNumber: number): void {
  if (team.roundsCreditGranted.has(roundNumber)) return;
  team.roundsCreditGranted.add(roundNumber);
  const roundDef = ROUNDS[roundNumber - 1];
  if (!roundDef) return;
  team.credits_balance += roundDef.credits;
  team.credits_total_awarded += roundDef.credits;
  team.current_round = roundNumber;
}

function roundDefToState(
  number: number,
  status: RoundStatus,
  startedAt: string | null,
  endedAt: string | null,
): RoundState {
  const roundDef = ROUNDS[number - 1];
  return {
    game_id: game.game_id,
    number,
    status,
    credits_awarded: roundDef?.credits ?? 0,
    title: roundDef?.title ?? null,
    narrative: roundDef?.narrative ?? null,
    duration_seconds: roundDef?.duration_seconds ?? null,
    started_at: startedAt,
    ended_at: endedAt,
  };
}

function upsertRound(state: RoundState): void {
  const idx = game.rounds.findIndex((r) => r.number === state.number);
  if (idx === -1) game.rounds.push(state);
  else game.rounds[idx] = state;
}

export async function hostNextRound(gameId: string, hostToken: string): Promise<RoundState> {
  requireHost(hostToken);
  if (gameId !== game.game_id) throw notFound(`Unknown game_id ${gameId}`);

  const endingRound = game.current_round;
  const now = new Date().toISOString();
  const ended = roundDefToState(endingRound, "ENDED", game.rounds.find((r) => r.number === endingRound)?.started_at ?? null, now);
  upsertRound(ended);
  stopTicks();
  mockBroadcast(game.game_id, "ROUND_ENDED", { round: endingRound }, {});
  return ended;
}

export async function hostStartRound(
  gameId: string,
  roundNumber: number,
  hostToken: string,
): Promise<RoundState> {
  requireHost(hostToken);
  if (gameId !== game.game_id) throw notFound(`Unknown game_id ${gameId}`);
  const roundDef = ROUNDS[roundNumber - 1];
  if (!roundDef) throw notFound(`Unknown round ${roundNumber}`);

  const now = new Date().toISOString();
  game.status = "ACTIVE";
  game.current_round = roundNumber;
  for (const team of game.teams.values()) grantRoundCredits(team, roundNumber);

  const started = roundDefToState(roundNumber, "ACTIVE", now, null);
  upsertRound(started);
  startTicks(roundNumber, roundDef.duration_seconds);

  mockBroadcast(
    game.game_id,
    "ROUND_STARTED",
    {
      round: roundDef.number,
      title: roundDef.title,
      narrative: roundDef.narrative,
      credits_awarded: roundDef.credits,
      duration_seconds: roundDef.duration_seconds,
      started_at: now,
      unlocks: roundDef.unlocks,
    },
    {},
  );
  return started;
}

export async function hostReveal(
  gameId: string,
  evidenceId: string,
  hostToken: string,
): Promise<void> {
  requireHost(hostToken);
  if (gameId !== game.game_id) throw notFound(`Unknown game_id ${gameId}`);
  const entity = entityById(evidenceId);
  if (!entity || (entity.label !== "Evidence" && entity.label !== "Message")) {
    throw notFound(`No Evidence/Message with id ${evidenceId}`);
  }

  mockBroadcast(
    game.game_id,
    "EVIDENCE_UNLOCKED",
    {
      evidence_id: entity.id,
      id: entity.id,
      evidence_type: String(entity.properties.evidence_type ?? entity.label.toLowerCase()),
      excerpt: String(entity.properties.content ?? ""),
      source: String(entity.properties.source ?? entity.properties.channel ?? "scripted_reveal"),
      captured_at:
        (entity.properties.captured_at as string | undefined) ??
        (entity.properties.sent_at as string | undefined) ??
        null,
      round: game.current_round,
    },
    {},
  );
}

function buildScoreboard(): ScoreBreakdown[] {
  return [...game.teams.values()]
    .map((team) => ({
      team_id: team.team_id,
      events: team.scoreEvents,
      total: team.totalScore,
    }))
    .sort((a, b) => b.total - a.total);
}

export async function hostFinish(gameId: string, hostToken: string): Promise<ScoreBreakdown[]> {
  requireHost(hostToken);
  if (gameId !== game.game_id) throw notFound(`Unknown game_id ${gameId}`);
  game.status = "FINISHED";
  game.finished_at = new Date().toISOString();
  stopTicks();

  const scoreboard = buildScoreboard();
  mockBroadcast(
    game.game_id,
    "GAME_FINISHED",
    {
      scoreboard: scoreboard.map((row) => ({
        team_id: row.team_id,
        total: row.total,
        team_name: game.teams.get(row.team_id)?.name,
      })),
    },
    {},
  );
  return scoreboard;
}

export async function getScoreboard(gameId: string, hostToken: string): Promise<ScoreBreakdown[]> {
  requireHost(hostToken);
  if (gameId !== game.game_id) throw notFound(`Unknown game_id ${gameId}`);
  return buildScoreboard();
}

export async function health(): Promise<{ status: string }> {
  return { status: "ok" };
}

export async function healthDeep(): Promise<Record<string, unknown>> {
  return { status: "ok", mode: "mock", teams: game.teams.size };
}

export { ENTITIES as MOCK_ENTITIES, RELATIONSHIPS as MOCK_RELATIONSHIPS, ROUNDS as MOCK_ROUNDS };
