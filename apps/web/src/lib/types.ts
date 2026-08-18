/**
 * TypeScript mirror of the Python Pydantic models.
 *
 * Source of truth:
 *   domain/game/contracts.py
 *   domain/investigation/contracts.py
 *   domain/graph/payload.py
 *   api/routes/play.py, api/routes/teams.py (request/response wrappers)
 *
 * WS payloads are typed from the envelopes the engine actually broadcasts
 * (application/advance_phase.py, record_investigation.py, submit_guess.py),
 * with optional fields so the richer mock broadcast still type-checks.
 */

// ---------------------------------------------------------------------------
// Graph schema (advisory unions for UI switches)
// ---------------------------------------------------------------------------

export type NodeLabel =
  | "Person"
  | "Application"
  | "Device"
  | "Phone"
  | "Email"
  | "IPAddress"
  | "Address"
  | "BankAccount"
  | "Company"
  | "Employer"
  | "Broker"
  | "Document"
  | "Evidence"
  | "Message"
  | "Transaction";

export const NODE_LABELS: readonly NodeLabel[] = [
  "Person",
  "Application",
  "Device",
  "Phone",
  "Email",
  "IPAddress",
  "Address",
  "BankAccount",
  "Company",
  "Employer",
  "Broker",
  "Document",
  "Evidence",
  "Message",
  "Transaction",
];

export type RelationshipType =
  | "SUBMITTED"
  | "USED_DEVICE"
  | "USED_PHONE"
  | "USED_EMAIL"
  | "RESIDES_AT"
  | "OWNS_ACCOUNT"
  | "WORKS_AT"
  | "EMPLOYED_BY"
  | "RELATED_TO"
  | "SAME_AS"
  | "ORIGINATED_BY"
  | "SUPPORTED_BY"
  | "CONNECTED_FROM"
  | "TRANSFERRED_TO"
  | "FROM_ACCOUNT"
  | "TO_ACCOUNT"
  | "CONTROLLED_BY"
  | "MENTIONS"
  | "MENTIONS_ACCOUNT"
  | "SENT_BY"
  | "SENT_TO";

export type ToolName =
  | "inspect_entity"
  | "find_shared_entities"
  | "find_path"
  | "expand_neighborhood"
  | "timeline"
  | "semantic_evidence_search"
  | "challenge_hypothesis";

export const TOOL_NAMES: readonly ToolName[] = [
  "inspect_entity",
  "find_shared_entities",
  "find_path",
  "expand_neighborhood",
  "timeline",
  "semantic_evidence_search",
  "challenge_hypothesis",
];

export type InvestigationIntent =
  | "ENTITY_LOOKUP"
  | "CONNECTION_SEARCH"
  | "PATH_SEARCH"
  | "NEIGHBORHOOD"
  | "TIMELINE"
  | "SEMANTIC_SEARCH"
  | "HYPOTHESIS_CHALLENGE"
  | "OUT_OF_SCOPE";

export interface InvestigationToolCall {
  tool: ToolName;
  arguments: Record<string, unknown>;
  justification: string;
}

export interface InvestigationPlan {
  intent: InvestigationIntent;
  tool_calls: InvestigationToolCall[];
  reasoning_summary: string;
}

export interface EvidenceRef {
  id: string;
  evidence_type: string;
  excerpt: string;
  source: string;
  captured_at: string | null;
}

export interface InvestigationAnswer {
  answer: string;
  evidence_ids: string[];
  discovered_node_ids: string[];
  discovered_relationship_ids: string[];
  caveats: string[];
}

/** POST /teams/{team_id}/investigate */
export interface InvestigationResult {
  action_id: string;
  question: string;
  plan: InvestigationPlan;
  answer: InvestigationAnswer;
  subgraph: GraphPayload;
  credits_charged: number;
  credits_remaining: number;
}

export interface GraphNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
  label_display: string;
}

export interface GraphRelationship {
  id: string;
  type: string;
  start_id: string;
  end_id: string;
  properties: Record<string, unknown>;
}

export interface GraphPayload {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

export const EMPTY_GRAPH_PAYLOAD: GraphPayload = { nodes: [], relationships: [] };

export interface CaseFile {
  id: string;
  labels: string[];
  label_display: string;
  occupation: string | null;
  credit_score: number | null;
  income_declared: number | null;
  age: number | null;
  amount: number | null;
  product: string | null;
  status: string | null;
}

export type FraudPattern =
  | "IDENTITY_RING"
  | "MULE_ACCOUNTS"
  | "BROKER_COLLUSION"
  | "SYNTHETIC_IDENTITIES"
  | "OTHER";

export const FRAUD_PATTERNS: readonly FraudPattern[] = [
  "IDENTITY_RING",
  "MULE_ACCOUNTS",
  "BROKER_COLLUSION",
  "SYNTHETIC_IDENTITIES",
  "OTHER",
];

export type GameStatus = "PENDING" | "ACTIVE" | "FINISHED";

/** A team walks the phases at its own pace; these are the three outcomes. */
export type TeamStatus = "PLAYING" | "SOLVED" | "FAILED";

/** A team gets three shots at naming the fraudster. */
export const MAX_GUESS_ATTEMPTS = 3;

/**
 * A phase's briefing copy — an immutable catalogue entry, not a state.
 * Phases no longer start or end, so there is no status/started_at here.
 */
export interface RoundState {
  game_id: string;
  number: number;
  credits_awarded: number;
  title: string | null;
  narrative: string | null;
  duration_seconds: number | null;
}

export interface TeamState {
  team_id: string;
  game_id: string;
  name: string;
  current_round: number;
  credits_balance: number;
  credits_total_awarded: number;
  status: TeamStatus;
  attempts_used: number;
  started_at: string | null;
  solved_at: string | null;
  discovered_node_ids: string[];
  discovered_relationship_ids: string[];
}

export interface GameState {
  game_id: string;
  scenario_slug: string;
  status: GameStatus;
  created_at: string;
  finished_at: string | null;
  rounds: RoundState[];
  teams: TeamState[];
}

/** POST /play/start — the only way into the game. */
export interface StartPlayResponse {
  team: TeamState;
  session_token: string;
  /** True when the name matched a team that already existed. */
  resumed: boolean;
  rounds: RoundState[];
}

/** POST /teams/{id}/advance */
export interface AdvancePhaseResponse {
  team: TeamState;
  briefing: RoundState;
}

/**
 * A hint's `text` is present only once the team has paid for it; until then
 * the card carries the title and price so a team can decide.
 */
export interface HintCard {
  id: string;
  round: number;
  cost: number;
  title: string;
  purchased: boolean;
  text: string | null;
}

export interface BuyHintResponse {
  hint: HintCard;
  credits_balance: number;
}

export interface Suspect {
  id: string;
  name: string;
  already_guessed: boolean;
}

/**
 * POST /teams/{id}/guess. Deliberately incapable of carrying the answer:
 * no person id, no name — only whether *this* guess was right.
 */
export interface GuessResult {
  correct: boolean;
  attempts_used: number;
  attempts_remaining: number;
  status: TeamStatus;
  elapsed_seconds: number;
  score: number;
}

export interface LeaderboardRow {
  team_id: string;
  team_name: string;
  status: TeamStatus;
  score: number;
  attempts_used: number;
  elapsed_seconds: number | null;
  current_round: number;
}

export interface InsufficientCreditsBody {
  error: "INSUFFICIENT_CREDITS";
  required: number;
  available: number;
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

export type WSRole = "team" | "screen";

export type WSEventType = "PHASE_ADVANCED" | "GRAPH_DISCOVERY" | "LEADERBOARD_CHANGED";

export const WS_EVENT_TYPES: readonly WSEventType[] = [
  "PHASE_ADVANCED",
  "GRAPH_DISCOVERY",
  "LEADERBOARD_CHANGED",
];

interface WSEnvelope<TType extends WSEventType, TPayload> {
  type: TType;
  game_id: string;
  seq: number;
  ts: string;
  payload: TPayload;
}

export interface PhaseAdvancedPayload {
  team_id: string;
  round: number;
  credits_balance: number;
}

export interface GraphDiscoveryPayload {
  team_id?: string;
  discovered?: GraphPayload;
  source_action_id?: string | null;
  node_ids?: string[];
  relationship_ids?: string[];
}

/**
 * Standings only. The leaderboard is on a wall every team can see, so this
 * event must never carry a person id or a suspect name.
 */
export interface LeaderboardChangedPayload {
  team_id: string;
  team_name: string;
  status: TeamStatus;
  score: number;
}

export type WSMessage =
  | WSEnvelope<"PHASE_ADVANCED", PhaseAdvancedPayload>
  | WSEnvelope<"GRAPH_DISCOVERY", GraphDiscoveryPayload>
  | WSEnvelope<"LEADERBOARD_CHANGED", LeaderboardChangedPayload>;

export function isWSEvent<T extends WSEventType>(
  msg: WSMessage,
  type: T,
): msg is Extract<WSMessage, { type: T }> {
  return msg.type === type;
}
