/**
 * Typed REST client for the Operation Nexus API.
 *
 * Pure functions only — no React, no global state. Callers supply whatever
 * token/header the route needs:
 *   - Team routes: `Authorization: Bearer <session token>`
 *   - Host routes: `X-Host-Token: <secret>`
 */
import type {
  Accusation,
  CaseFile,
  CreateTeamResponse,
  GameState,
  GraphPayload,
  InsufficientCreditsBody,
  InvestigationResult,
  JoinTeamResponse,
  RoundState,
  ScoreBreakdown,
  TeamState,
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL;
const API_PREFIX = "/api/v1";

export class ApiError<TBody = unknown> extends Error {
  readonly status: number;
  readonly body: TBody;

  constructor(status: number, body: TBody, message?: string) {
    super(message ?? `Operation Nexus API responded ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function isInsufficientCredits(
  err: unknown,
): err is ApiError<InsufficientCreditsBody> {
  if (!(err instanceof ApiError) || err.status !== 402) return false;
  const body = err.body as Partial<InsufficientCreditsBody> | null;
  return !!body && body.error === "INSUFFICIENT_CREDITS";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  bearerToken?: string;
  hostToken?: string;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function request<T>(
  path: string,
  options: RequestOptions & { skipPrefix?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.bearerToken) headers["Authorization"] = `Bearer ${options.bearerToken}`;
  if (options.hostToken) headers["X-Host-Token"] = options.hostToken;

  const prefix = options.skipPrefix ? "" : API_PREFIX;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${prefix}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (cause) {
    throw new ApiError(0, null, `Network error reaching ${path}: ${String(cause)}`);
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // error body wasn't JSON (or was empty) — leave body as null
    }
    const message = isRecord(body) && typeof body.detail === "string" ? body.detail : undefined;
    throw new ApiError(res.status, body, message);
  }

  if (res.status === 202 || res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export function createGame(scenarioSlug: string): Promise<GameState> {
  return request<GameState>("/games", { method: "POST", body: { scenario_slug: scenarioSlug } });
}

export function getGame(gameId: string): Promise<GameState> {
  return request<GameState>(`/games/${gameId}`);
}

export function createTeam(gameId: string, name: string): Promise<CreateTeamResponse> {
  return request<CreateTeamResponse>(`/games/${gameId}/teams`, { method: "POST", body: { name } });
}

export function joinTeam(joinCode: string): Promise<JoinTeamResponse> {
  return request<JoinTeamResponse>("/teams/join", { method: "POST", body: { join_code: joinCode } });
}

export function getTeamState(teamId: string, bearerToken: string): Promise<TeamState> {
  return request<TeamState>(`/teams/${teamId}/state`, { bearerToken });
}

export function investigate(
  teamId: string,
  question: string,
  bearerToken: string,
): Promise<InvestigationResult> {
  return request<InvestigationResult>(`/teams/${teamId}/investigate`, {
    method: "POST",
    body: { question },
    bearerToken,
  });
}

export function submitAccusation(
  teamId: string,
  accusation: Accusation,
  bearerToken: string,
): Promise<void> {
  return request<void>(`/teams/${teamId}/accusation`, {
    method: "POST",
    body: accusation,
    bearerToken,
  });
}

export function getTeamGraph(teamId: string, bearerToken: string): Promise<GraphPayload> {
  return request<GraphPayload>(`/teams/${teamId}/graph`, { bearerToken });
}

export function getDocket(teamId: string, bearerToken: string): Promise<CaseFile[]> {
  return request<CaseFile[]>(`/teams/${teamId}/docket`, { bearerToken });
}

export function hostNextRound(gameId: string, hostToken: string): Promise<RoundState> {
  return request<RoundState>(`/host/games/${gameId}/rounds/next`, { method: "POST", hostToken });
}

export function hostStartRound(
  gameId: string,
  roundNumber: number,
  hostToken: string,
): Promise<RoundState> {
  return request<RoundState>(`/host/games/${gameId}/rounds/${roundNumber}/start`, {
    method: "POST",
    hostToken,
  });
}

export function hostReveal(gameId: string, evidenceId: string, hostToken: string): Promise<void> {
  return request<void>(`/host/games/${gameId}/reveal`, {
    method: "POST",
    body: { evidence_id: evidenceId },
    hostToken,
  });
}

export function hostFinish(gameId: string, hostToken: string): Promise<ScoreBreakdown[]> {
  return request<ScoreBreakdown[]>(`/host/games/${gameId}/finish`, { method: "POST", hostToken });
}

export function getScoreboard(gameId: string, hostToken: string): Promise<ScoreBreakdown[]> {
  return request<ScoreBreakdown[]>(`/host/games/${gameId}/scoreboard`, { hostToken });
}

export function health(): Promise<{ status: string }> {
  return request<{ status: string }>("/health", { skipPrefix: true });
}

export function healthDeep(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/health/deep", { skipPrefix: true });
}
