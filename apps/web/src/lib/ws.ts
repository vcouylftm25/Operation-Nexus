/**
 * Reconnecting WebSocket client for `/ws/games/{game_id}?role=...&token=...`
 * (CONTRACT.md §9).
 *
 * Responsibilities kept deliberately narrow and pure so they're unit-testable
 * without a real socket:
 *   - exponential backoff with full jitter on unexpected close (computeBackoffDelay
 *     is exported standalone so the math can be tested without opening a socket)
 *   - `seq` gap detection: warns via console.warn and emits a "gap" event —
 *     the caller (see src/features/game/useGameSocket.ts) is expected to react
 *     to "gap" by refetching authoritative state (team/graph/leaderboard) since
 *     this module has no knowledge of TanStack Query.
 *   - a small typed event emitter, discriminated by WSEventType plus a few
 *     connection-lifecycle meta-events ("status", "open", "close", "reconnecting", "gap")
 */
import type { WSEventType, WSMessage, WSRole } from "./types";

export type ConnectionStatus = "connecting" | "open" | "closed" | "reconnecting";

export interface SeqGapDetail {
  expectedSeq: number;
  receivedSeq: number;
}

export interface BackoffOptions {
  minMs?: number;
  maxMs?: number;
  jitter?: boolean;
}

/**
 * Full-jitter exponential backoff (AWS Architecture Blog algorithm):
 * `random(0, min(maxMs, minMs * 2^attempt))`. Pure function — no timers, no
 * state — so the growth curve can be asserted directly in tests.
 */
export function computeBackoffDelay(
  attempt: number,
  { minMs = 500, maxMs = 30_000, jitter = true }: BackoffOptions = {},
): number {
  const exp = Math.min(maxMs, minMs * 2 ** Math.max(0, attempt));
  if (!jitter) return exp;
  return Math.round(Math.random() * exp);
}

interface MetaEvents {
  status: ConnectionStatus;
  open: undefined;
  close: { code: number; reason: string };
  reconnecting: { attempt: number; delayMs: number };
  gap: SeqGapDetail;
}

type AnyListener = (payload: never) => void;

export interface GameSocketOptions {
  gameId: string;
  role: WSRole;
  token: string;
  /** Overrides VITE_WS_URL — mainly for tests. */
  baseUrl?: string;
  backoff?: BackoffOptions;
  /** Injectable WebSocket constructor, for tests. Defaults to global WebSocket. */
  WebSocketImpl?: typeof WebSocket;
}

/**
 * Wraps a single `/ws/games/{game_id}` connection. Construct it, `.connect()`,
 * subscribe with `.on(...)`, and `.close()` when the owning component unmounts.
 */
export class GameSocket {
  private readonly gameId: string;
  private readonly role: WSRole;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly backoff: Required<BackoffOptions>;
  private readonly WebSocketImpl: typeof WebSocket;

  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "closed";
  private attempt = 0;
  private lastSeq: number | null = null;
  private manuallyClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<string, Set<AnyListener>>();

  constructor(options: GameSocketOptions) {
    this.gameId = options.gameId;
    this.role = options.role;
    this.token = options.token;
    this.baseUrl = options.baseUrl ?? import.meta.env.VITE_WS_URL;
    this.backoff = {
      minMs: options.backoff?.minMs ?? 500,
      maxMs: options.backoff?.maxMs ?? 30_000,
      jitter: options.backoff?.jitter ?? true,
    };
    this.WebSocketImpl = options.WebSocketImpl ?? WebSocket;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getLastSeq(): number | null {
    return this.lastSeq;
  }

  connect(): void {
    this.manuallyClosed = false;
    this.open();
  }

  close(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close(1000, "client closed");
    this.ws = null;
    this.setStatus("closed");
  }

  /** Typed per-event-type subscription — handler gets the full envelope. */
  on<T extends WSEventType>(
    type: T,
    handler: (msg: Extract<WSMessage, { type: T }>) => void,
  ): () => void;
  on(type: "message", handler: (msg: WSMessage) => void): () => void;
  on<K extends keyof MetaEvents>(type: K, handler: (payload: MetaEvents[K]) => void): () => void;
  on(type: string, handler: (payload: never) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  private emit(type: string, payload: unknown): void {
    const set = this.listeners.get(type);
    if (!set || set.size === 0) return;
    for (const handler of set) {
      (handler as (p: unknown) => void)(payload);
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.emit("status", status);
  }

  private open(): void {
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");

    const url = `${this.baseUrl}/ws/games/${this.gameId}?role=${this.role}&token=${encodeURIComponent(this.token)}`;
    const ws = new this.WebSocketImpl(url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.setStatus("open");
      this.emit("open", undefined);
    };

    ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(typeof event.data === "string" ? event.data : String(event.data));
    };

    ws.onclose = (event: CloseEvent) => {
      this.ws = null;
      this.setStatus("closed");
      this.emit("close", { code: event.code, reason: event.reason });
      if (!this.manuallyClosed) {
        this.scheduleReconnect();
      }
    };

    // onclose always fires after onerror for browser WebSockets, so reconnect
    // scheduling lives only in onclose to avoid a double-schedule.
    ws.onerror = () => {
      console.warn(`[GameSocket] socket error on game ${this.gameId}`);
    };
  }

  private scheduleReconnect(): void {
    const delayMs = computeBackoffDelay(this.attempt, this.backoff);
    this.attempt += 1;
    this.emit("reconnecting", { attempt: this.attempt, delayMs });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delayMs);
  }

  private handleMessage(raw: string): void {
    let msg: WSMessage;
    try {
      msg = JSON.parse(raw) as WSMessage;
    } catch {
      console.warn("[GameSocket] ignoring non-JSON WS message", raw);
      return;
    }

    if (this.lastSeq !== null && msg.seq > this.lastSeq + 1) {
      const detail: SeqGapDetail = { expectedSeq: this.lastSeq + 1, receivedSeq: msg.seq };
      console.warn(
        `[GameSocket] seq gap on game ${this.gameId}: expected ${detail.expectedSeq}, got ${detail.receivedSeq}. Triggering a state refetch.`,
      );
      this.emit("gap", detail);
    }

    if (this.lastSeq === null || msg.seq > this.lastSeq) {
      this.lastSeq = msg.seq;
    }

    this.emit("message", msg);
    this.emit(msg.type, msg);
  }
}
