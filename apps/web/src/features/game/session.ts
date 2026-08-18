/**
 * Client-side session store — which role this browser tab is acting as, and
 * whatever credential that role needs (CONTRACT.md §8: team routes carry a
 * bearer session token, host routes carry `X-Host-Token`; `screen` needs
 * neither REST credential, only a game id to open its WS connection with).
 *
 * Persisted to sessionStorage so a live-event refresh (projector flicker, a
 * team's laptop reloading mid-round) doesn't drop the connection.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface TeamSession {
  role: "team";
  gameId: string;
  teamId: string;
  teamName: string;
  sessionToken: string;
}

export interface HostSession {
  role: "host";
  gameId: string;
  hostToken: string;
}

export interface ScreenSession {
  role: "screen";
  gameId: string;
}

export type Session = TeamSession | HostSession | ScreenSession | null;

interface SessionStore {
  session: Session;
  setTeamSession: (s: Omit<TeamSession, "role">) => void;
  setHostSession: (s: Omit<HostSession, "role">) => void;
  setScreenSession: (s: Omit<ScreenSession, "role">) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      session: null,
      setTeamSession: (s) => set({ session: { role: "team", ...s } }),
      setHostSession: (s) => set({ session: { role: "host", ...s } }),
      setScreenSession: (s) => set({ session: { role: "screen", ...s } }),
      clear: () => set({ session: null }),
    }),
    {
      name: "operation-nexus-session",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
