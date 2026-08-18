import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, WebSocketImpl } from "@/lib/client";
import { GameSocket } from "@/lib/ws";
import type { ConnectionStatus } from "@/lib/ws";
import type { GraphDiscoveryPayload, WSMessage } from "@/lib/types";
import { useGraphStore } from "@/features/graph/graphStore";
import { useLiveStore } from "./liveStore";
import { useSessionStore } from "./session";

function discoveryNodeCount(payload: GraphDiscoveryPayload): number {
  if (payload.discovered) return payload.discovered.nodes.length;
  return payload.node_ids?.length ?? 0;
}

export function useGameSocket(): ConnectionStatus {
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const connectionStatus = useLiveStore((s) => s.connectionStatus);

  useEffect(() => {
    if (!session) return;

    const live = useLiveStore.getState();
    live.resetLive();

    const token =
      session.role === "team" ? session.sessionToken : session.role === "host" ? session.hostToken : "";

    const socket = new GameSocket({
      gameId: session.gameId,
      role: session.role,
      token,
      WebSocketImpl,
    });

    const unsubs = [
      socket.on("status", (status) => {
        useLiveStore.getState().setConnectionStatus(status);
      }),
      socket.on("gap", () => {
        void queryClient.invalidateQueries({ queryKey: ["team"] });
        void queryClient.invalidateQueries({ queryKey: ["graph"] });
        void queryClient.invalidateQueries({ queryKey: ["scoreboard"] });
        void queryClient.invalidateQueries({ queryKey: ["game"] });
        if (session.role === "team") {
          void refetchAuthoritative("team", {
            gameId: session.gameId,
            teamId: session.teamId,
            token: session.sessionToken,
          });
        }
      }),
      socket.on("message", (msg: WSMessage) => {
        handleMessage(
          msg,
          session.role,
          session.role === "team" ? session.teamId : undefined,
          queryClient,
        );
      }),
    ];

    socket.connect();

    return () => {
      for (const off of unsubs) off();
      socket.close();
    };
  }, [session, queryClient]);

  return connectionStatus;
}

function invalidateLiveQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["game"] });
  void queryClient.invalidateQueries({ queryKey: ["team"] });
  void queryClient.invalidateQueries({ queryKey: ["scoreboard"] });
  void queryClient.invalidateQueries({ queryKey: ["graph"] });
}

function handleMessage(
  msg: WSMessage,
  role: "team" | "host" | "screen",
  teamId: string | undefined,
  queryClient: QueryClient,
): void {
  const live = useLiveStore.getState();

  switch (msg.type) {
    case "ROUND_STARTED":
      live.applyRoundStarted(msg.payload);
      invalidateLiveQueries(queryClient);
      break;
    case "ROUND_ENDED":
      live.applyRoundEnded(msg.payload.round);
      invalidateLiveQueries(queryClient);
      break;
    case "TICK":
      live.applyTick(msg.payload.seconds_remaining, msg.payload.round);
      break;
    case "GAME_FINISHED":
      live.applyGameFinished();
      for (const row of msg.payload.scoreboard) {
        live.applyScore(row.team_id, row.total);
      }
      invalidateLiveQueries(queryClient);
      break;
    case "HOST_ANNOUNCEMENT":
      live.applyAnnouncement(msg.payload);
      break;
    case "EVIDENCE_UNLOCKED":
      live.applyEvidence(msg.payload);
      break;
    case "TEAM_SCORE_UPDATED":
      live.applyScore(
        msg.payload.team_id,
        msg.payload.total ?? msg.payload.total_score ?? 0,
        msg.payload.event,
      );
      break;
    case "ACCUSATION_SUBMITTED":
      live.setAccusationNotice(
        `${msg.payload.team_name ?? "Uma equipe"} enviou a acusação.`,
      );
      break;
    case "GRAPH_DISCOVERY": {
      const count = discoveryNodeCount(msg.payload);
      if (role === "screen") {
        live.pushFlash({
          teamId: msg.payload.team_id ?? "unknown",
          teamName: msg.payload.team_id ? `Equipe ${msg.payload.team_id.slice(-4)}` : "Uma equipe",
          nodeCount: count,
        });
        break;
      }
      const mine = !msg.payload.team_id || !teamId || msg.payload.team_id === teamId;
      if (mine && msg.payload.discovered) {
        useGraphStore.getState().merge(msg.payload.discovered);
      }
      break;
    }
  }
}

export async function refetchAuthoritative(
  role: "team" | "host" | "screen",
  ids: { gameId: string; teamId?: string; token?: string; hostToken?: string },
): Promise<void> {
  if (role === "team" && ids.teamId && ids.token) {
    const [state, graph] = await Promise.all([
      api.getTeamState(ids.teamId, ids.token),
      api.getTeamGraph(ids.teamId, ids.token),
    ]);
    useGraphStore.getState().merge(graph);
    useLiveStore.getState().hydrateFromGame({
      currentRound: state.current_round,
      status: "ACTIVE",
      title: null,
      narrative: null,
      durationSeconds: null,
      startedAt: null,
    });
  }
  if ((role === "host" || role === "screen") && ids.gameId) {
    await api.getGame(ids.gameId);
  }
}
