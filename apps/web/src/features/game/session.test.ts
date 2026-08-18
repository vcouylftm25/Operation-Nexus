import { beforeEach, describe, expect, it } from "vitest";
import { SESSION_STORAGE_KEY, useSessionStore } from "@/features/game/session";

const session = {
  team_id: "team-1",
  game_id: "game-1",
  session_token: "tok",
  team_name: "Os Detetives",
};

describe("session store", () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ session: null });
  });

  it("keeps the four credentials a team needs to talk to the API", () => {
    useSessionStore.getState().setSession(session);
    expect(useSessionStore.getState().session).toEqual(session);
  });

  it("survives in localStorage so a closed tab does not lose the run", () => {
    useSessionStore.getState().setSession(session);

    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? "{}")).toMatchObject({ state: { session } });
  });

  it("clears the session", () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().clear();
    expect(useSessionStore.getState().session).toBeNull();
  });
});
