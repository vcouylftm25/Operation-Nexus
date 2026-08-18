/**
 * The credential this browser plays as: the team it started (or resumed) and
 * the bearer token every `/teams/{id}/...` call carries.
 *
 * Persisted to localStorage, not sessionStorage: the whole entry story is
 * "type your team name and you are back where you were". Players close tabs
 * and reload on phones mid-game, and a session that died with the tab would
 * break that promise on the very device that still has it.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface TeamSession {
  team_id: string;
  game_id: string;
  session_token: string;
  team_name: string;
}

interface SessionStore {
  session: TeamSession | null;
  setSession: (session: TeamSession) => void;
  clear: () => void;
}

export const SESSION_STORAGE_KEY = "operation-nexus-session";

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      clear: () => set({ session: null }),
    }),
    {
      name: SESSION_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
