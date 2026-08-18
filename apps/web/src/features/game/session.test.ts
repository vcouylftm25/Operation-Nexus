import { beforeEach, describe, expect, it } from "vitest";
import { useSessionStore } from "@/features/game/session";

describe("session store", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useSessionStore.setState({ session: null });
  });

  it("stores a team session", () => {
    useSessionStore.getState().setTeamSession({
      gameId: "game-1",
      teamId: "team-1",
      teamName: "Alfa",
      sessionToken: "tok",
    });
    const session = useSessionStore.getState().session;
    expect(session?.role).toBe("team");
    if (session?.role === "team") {
      expect(session.teamName).toBe("Alfa");
      expect(session.sessionToken).toBe("tok");
    }
  });

  it("stores host and screen sessions and can clear", () => {
    useSessionStore.getState().setHostSession({ gameId: "g", hostToken: "h" });
    expect(useSessionStore.getState().session?.role).toBe("host");
    useSessionStore.getState().setScreenSession({ gameId: "g" });
    expect(useSessionStore.getState().session?.role).toBe("screen");
    useSessionStore.getState().clear();
    expect(useSessionStore.getState().session).toBeNull();
  });
});
