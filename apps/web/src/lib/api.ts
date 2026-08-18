/**
 * Typed REST client for the Operation Nexus API.
 *
 * Pure functions only — no React, no global state. Team routes authenticate
 * with `Authorization: Bearer <session token>`; the leaderboard is public.
 */
import type {
  AdvancePhaseResponse,
  BuyHintResponse,
  CaseFile,
  GameState,
  GraphPayload,
  GuessResult,
  HintCard,
  InsufficientCreditsBody,
  InvestigationResult,
  LeaderboardRow,
  StartPlayResponse,
  Suspect,
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

/**
 * The only way into the game: type a team name. Typing a name that already
 * exists resumes that team rather than failing, which is how a player who
 * closed the tab gets back in.
 */
export function startPlay(teamName: string): Promise<StartPlayResponse> {
  return request<StartPlayResponse>("/play/start", {
    method: "POST",
    body: { team_name: teamName },
  });
}

export function getGame(gameId: string): Promise<GameState> {
  return request<GameState>(`/games/${gameId}`);
}

/** Public — this goes on a projector, so it takes no token. */
export function getLeaderboard(gameId: string): Promise<LeaderboardRow[]> {
  return request<LeaderboardRow[]>(`/play/games/${gameId}/leaderboard`);
}

export function getTeamState(teamId: string, bearerToken: string): Promise<TeamState> {
  return request<TeamState>(`/teams/${teamId}/state`, { bearerToken });
}

export function advancePhase(
  teamId: string,
  bearerToken: string,
): Promise<AdvancePhaseResponse> {
  return request<AdvancePhaseResponse>(`/teams/${teamId}/advance`, {
    method: "POST",
    bearerToken,
  });
}

export function getHints(teamId: string, bearerToken: string): Promise<HintCard[]> {
  return request<HintCard[]>(`/teams/${teamId}/hints`, { bearerToken });
}

export function buyHint(
  teamId: string,
  hintId: string,
  bearerToken: string,
): Promise<BuyHintResponse> {
  return request<BuyHintResponse>(`/teams/${teamId}/hints/${hintId}`, {
    method: "POST",
    bearerToken,
  });
}

export function getSuspects(teamId: string, bearerToken: string): Promise<Suspect[]> {
  return request<Suspect[]>(`/teams/${teamId}/suspects`, { bearerToken });
}

export function submitGuess(
  teamId: string,
  personId: string,
  bearerToken: string,
): Promise<GuessResult> {
  return request<GuessResult>(`/teams/${teamId}/guess`, {
    method: "POST",
    body: { person_id: personId },
    bearerToken,
  });
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

export function getTeamGraph(teamId: string, bearerToken: string): Promise<GraphPayload> {
  return request<GraphPayload>(`/teams/${teamId}/graph`, { bearerToken });
}

export function getDocket(teamId: string, bearerToken: string): Promise<CaseFile[]> {
  return request<CaseFile[]>(`/teams/${teamId}/docket`, { bearerToken });
}

export function health(): Promise<{ status: string }> {
  return request<{ status: string }>("/health", { skipPrefix: true });
}

export function healthDeep(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/health/deep", { skipPrefix: true });
}
