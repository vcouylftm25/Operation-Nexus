/**
 * The ONE place mock mode is selected. Every feature hook imports `api` and
 * `WebSocketImpl` from here — never from `./api`/`./mock/mockApi` directly —
 * so there is exactly one `if (mock)` branch in the whole app (item 4 of the
 * web agent brief: "Wire it as a swappable module, not scattered `if (mock)`
 * branches").
 *
 * `VITE_MOCK=true` runs the whole frontend against the in-memory fake API/WS
 * defined in `./mock/`, with zero backend required.
 */
import * as realApi from "./api";
import * as mockApi from "./mock/mockApi";
import { MockWebSocket } from "./mock/mockWs";

export const IS_MOCK = import.meta.env.VITE_MOCK === "true";

type ApiModule = Omit<typeof realApi, "ApiError" | "isInsufficientCredits">;

// Both modules export the same function names/signatures (enforced by
// mockApi.ts being written against api.ts's surface) — see each file's header.
export const api: ApiModule = IS_MOCK ? mockApi : realApi;

// ApiError / isInsufficientCredits are pure and stateless, so they're never
// mocked — both real and mock code throw the exact same ApiError class.
export { ApiError, isInsufficientCredits } from "./api";

export const WebSocketImpl: typeof WebSocket = IS_MOCK
  ? (MockWebSocket as unknown as typeof WebSocket)
  : WebSocket;
