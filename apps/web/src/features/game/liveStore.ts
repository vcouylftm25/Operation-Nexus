/**
 * The little that is genuinely "live" client state.
 *
 * Everything a team can see — its phase, its credits, its graph, the ranking —
 * is server state owned by TanStack Query, and the socket's job is to
 * invalidate it. What is left here is the connection itself, which several
 * screens display and no query owns.
 */
import { create } from "zustand";
import type { ConnectionStatus } from "@/lib/ws";

interface LiveState {
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;
  resetLive: () => void;
}

export const useLiveStore = create<LiveState>((set) => ({
  connectionStatus: "closed",
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  resetLive: () => set({ connectionStatus: "closed" }),
}));
