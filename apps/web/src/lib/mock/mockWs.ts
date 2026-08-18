/**
 * In-memory stand-in for the `/ws/games/{game_id}` connection (CONTRACT.md §9).
 *
 * `MockWebSocket` implements just the slice of the browser `WebSocket`
 * interface that `src/lib/ws.ts`'s `GameSocket` touches, so `GameSocket` runs
 * completely unmodified in mock mode — swap only happens once, in
 * `src/lib/client.ts`, by injecting this class as `WebSocketImpl`.
 */
import type { WSEventType, WSMessage, WSRole } from "../types";

type Handler<E> = ((ev: E) => void) | null;

export class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances = new Set<MockWebSocket>();

  readonly url: string;
  readonly gameId: string;
  readonly role: WSRole;
  readonly token: string;
  readyState = MockWebSocket.CONNECTING;

  onopen: Handler<Event> = null;
  onclose: Handler<CloseEvent> = null;
  onerror: Handler<Event> = null;
  onmessage: Handler<MessageEvent> = null;

  constructor(url: string) {
    this.url = url;
    const parsed = new URL(url.replace(/^ws/, "http"));
    this.gameId = parsed.pathname.split("/").pop() ?? "";
    this.role = (parsed.searchParams.get("role") as WSRole | null) ?? "team";
    this.token = parsed.searchParams.get("token") ?? "";

    MockWebSocket.instances.add(this);
    // Simulate the network round-trip so callers observe "connecting" first.
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event("open"));
    }, 20);
  }

  send(): void {
    // Server-push only in this scenario (CONTRACT.md §9 defines no client->server
    // WS messages) — intentionally a no-op.
  }

  close(code = 1000, reason = "mock close"): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    MockWebSocket.instances.delete(this);
    this.onclose?.(new CloseEvent("close", { code, reason, wasClean: true }));
  }

  /** @internal used by mockBroadcast */
  _deliver(msg: WSMessage): void {
    if (this.readyState !== MockWebSocket.OPEN) return;
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(msg) }));
  }
}

const seqByGame = new Map<string, number>();
function nextSeq(gameId: string): number {
  const next = (seqByGame.get(gameId) ?? 0) + 1;
  seqByGame.set(gameId, next);
  return next;
}

export interface BroadcastTarget {
  /** Restrict delivery to sockets with this role. Omit to reach every role. */
  role?: WSRole;
  /** Restrict `role: "team"` delivery to the socket whose token matches this team's session token. */
  teamToken?: string;
}

/**
 * Broadcasts one WS envelope to every matching connected mock socket for a
 * game. Mirrors the real server's fan-out, including the non-negotiable rule
 * that GRAPH_DISCOVERY only reaches `screen` and the owning team (CONTRACT.md §9).
 */
export function mockBroadcast<T extends WSEventType>(
  gameId: string,
  type: T,
  payload: Extract<WSMessage, { type: T }>["payload"],
  target: BroadcastTarget = {},
): void {
  const envelope = {
    type,
    game_id: gameId,
    seq: nextSeq(gameId),
    ts: new Date().toISOString(),
    payload,
  } as WSMessage;

  for (const sock of MockWebSocket.instances) {
    if (sock.gameId !== gameId) continue;
    if (target.role && sock.role !== target.role) continue;
    if (target.role === "team" && target.teamToken && sock.token !== target.teamToken) continue;
    sock._deliver(envelope);
  }
}

/** Test/dev helper: force-close every open mock socket for a game (simulates a server restart). */
export function mockDisconnectAll(gameId?: string): void {
  for (const sock of [...MockWebSocket.instances]) {
    if (!gameId || sock.gameId === gameId) sock.close(1001, "server restart (mock)");
  }
}
