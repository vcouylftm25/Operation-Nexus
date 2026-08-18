/**
 * TypeScript mirror of the Python Pydantic models.
 *
 * Source of truth:
 *   domain/game/contracts.py
 *   domain/investigation/contracts.py
 *   domain/graph/payload.py
 *   api/routes/teams.py (JoinTeamResponse)
 *   api/routes/games.py (CreateTeamResponse)
 *
 * WS payloads are typed from the envelopes the engine actually broadcasts
 * (application/start_round.py, record_investigation.py, finish_game.py),
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

export interface Accusation {
  accused_person_ids: string[];
  coordinator_person_id: string;
  pattern: FraudPattern;
  evidence_ids: string[];
  key_relationship_ids: string[];
  confidence: number;
  rationale: string;
}

export interface ScoreEvent {
  team_id: string;
  round: number;
  rule: string;
  delta: number;
  detail: string;
}

export interface ScoreBreakdown {
  team_id: string;
  events: ScoreEvent[];
  total: number;
}

export type JoinCode = string;

export const ROUND_CREDITS: readonly number[] = [100, 120, 140, 160];
export const TOTAL_ROUNDS = ROUND_CREDITS.length;

export type GameStatus = "PENDING" | "ACTIVE" | "FINISHED";
export type RoundStatus = "PENDING" | "ACTIVE" | "ENDED";

export interface RoundState {
  game_id: string;
  number: number;
  status: RoundStatus;
  credits_awarded: number;
  title: string | null;
  narrative: string | null;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface TeamState {
  team_id: string;
  game_id: string;
  name: string;
  join_code: string;
  current_round: number;
  credits_balance: number;
  credits_total_awarded: number;
  discovered_node_ids: string[];
  discovered_relationship_ids: string[];
}

export interface GameState {
  game_id: string;
  scenario_slug: string;
  status: GameStatus;
  current_round: number;
  created_at: string;
  finished_at: string | null;
  rounds: RoundState[];
  teams: TeamState[];
}

export interface CreateTeamResponse {
  team_id: string;
  join_code: JoinCode;
}

export interface JoinTeamResponse {
  team_id: string;
  game_id: string;
  session_token: string;
}

export interface InsufficientCreditsBody {
  error: "INSUFFICIENT_CREDITS";
  required: number;
  available: number;
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

export type WSRole = "team" | "host" | "screen";

export type WSEventType =
  | "ROUND_STARTED"
  | "ROUND_ENDED"
  | "TEAM_SCORE_UPDATED"
  | "EVIDENCE_UNLOCKED"
  | "GRAPH_DISCOVERY"
  | "ACCUSATION_SUBMITTED"
  | "GAME_FINISHED"
  | "HOST_ANNOUNCEMENT"
  | "TICK";

export const WS_EVENT_TYPES: readonly WSEventType[] = [
  "ROUND_STARTED",
  "ROUND_ENDED",
  "TEAM_SCORE_UPDATED",
  "EVIDENCE_UNLOCKED",
  "GRAPH_DISCOVERY",
  "ACCUSATION_SUBMITTED",
  "GAME_FINISHED",
  "HOST_ANNOUNCEMENT",
  "TICK",
];

interface WSEnvelope<TType extends WSEventType, TPayload> {
  type: TType;
  game_id: string;
  seq: number;
  ts: string;
  payload: TPayload;
}

export interface RoundStartedPayload {
  round: number;
  title: string | null;
  narrative: string | null;
  duration_seconds: number | null;
  credits_awarded: number;
  started_at?: string;
  unlocks?: string[];
}

export interface RoundEndedPayload {
  round: number;
}

export interface TeamScoreUpdatedPayload {
  team_id: string;
  total?: number;
  team_name?: string;
  total_score?: number;
  event?: ScoreEvent;
}

export interface EvidenceUnlockedPayload {
  evidence_id?: string;
  id?: string;
  evidence_type?: string;
  excerpt?: string;
  source?: string;
  captured_at?: string | null;
  round?: number;
  revealed_at?: string;
}

export interface GraphDiscoveryPayload {
  team_id?: string;
  discovered?: GraphPayload;
  source_action_id?: string | null;
  node_ids?: string[];
  relationship_ids?: string[];
}

export interface AccusationSubmittedPayload {
  team_id: string;
  team_name?: string;
}

export interface GameFinishedScoreRow {
  team_id: string;
  total: number;
  team_name?: string;
}

export interface GameFinishedPayload {
  scoreboard: GameFinishedScoreRow[];
}

export interface HostAnnouncementPayload {
  message: string;
  level: "info" | "warning" | "critical";
}

export interface TickPayload {
  round: number;
  seconds_remaining: number;
}

export type WSMessage =
  | WSEnvelope<"ROUND_STARTED", RoundStartedPayload>
  | WSEnvelope<"ROUND_ENDED", RoundEndedPayload>
  | WSEnvelope<"TEAM_SCORE_UPDATED", TeamScoreUpdatedPayload>
  | WSEnvelope<"EVIDENCE_UNLOCKED", EvidenceUnlockedPayload>
  | WSEnvelope<"GRAPH_DISCOVERY", GraphDiscoveryPayload>
  | WSEnvelope<"ACCUSATION_SUBMITTED", AccusationSubmittedPayload>
  | WSEnvelope<"GAME_FINISHED", GameFinishedPayload>
  | WSEnvelope<"HOST_ANNOUNCEMENT", HostAnnouncementPayload>
  | WSEnvelope<"TICK", TickPayload>;

export function isWSEvent<T extends WSEventType>(
  msg: WSMessage,
  type: T,
): msg is Extract<WSMessage, { type: T }> {
  return msg.type === type;
}
