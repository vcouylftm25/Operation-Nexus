/**
 * Light/dark toggle for the Nexus Graph Workspace v2 scope (the graph canvas
 * + investigator panel — see `.nx-scope` in styles/index.css). Persisted so a
 * team doesn't lose its preference on refresh. Scoped on purpose: the rest of
 * the app keeps its own dark-only amber palette.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type NxTheme = "light" | "dark";

interface NxThemeStore {
  theme: NxTheme;
  set: (theme: NxTheme) => void;
  toggle: () => void;
}

export const useNxThemeStore = create<NxThemeStore>()(
  persist(
    (set, get) => ({
      theme: "dark",
      set: (theme) => set({ theme }),
      toggle: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
    }),
    { name: "nexus-graph-theme", storage: createJSONStorage(() => localStorage) },
  ),
);
