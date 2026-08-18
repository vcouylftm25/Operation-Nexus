import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, WebSocketImpl } from "@/lib/client";
import { GameSocket } from "@/lib/ws";
import type { ConnectionStatus } from "@/lib/ws";
import type { WSMessage } from "@/lib/types";
import { useGraphStore } from "@/features/graph/graphStore";
import { useLiveStore } from "./liveStore";

export type SocketTarget =
  | { role: "team"; gameId: string; teamId: string; token: string }
  | { role: "screen"; gameId: string };

function invalidateTeamQueries(queryClient: QueryClient, teamId: string): void {
  void queryClient.invalidateQueries({ queryKey: ["team", teamId] });
  void queryClient.invalidateQueries({ queryKey: ["graph", teamId] });
  void queryClient.invalidateQueries({ queryKey: ["docket", teamId] });
  void queryClient.invalidateQueries({ queryKey: ["hints", teamId] });
  void queryClient.invalidateQueries({ queryKey: ["suspects", teamId] });
}

function handleMessage(
  msg: WSMessage,
  teamId: string | null,
  gameId: string,
  queryClient: QueryClient,
): void {
  switch (msg.type) {
    case "PHASE_ADVANCED":
      if (teamId) invalidateTeamQueries(queryClient, teamId);
      break;
    case "GRAPH_DISCOVERY": {
      const mine = !msg.payload.team_id || !teamId || msg.payload.team_id === teamId;
      if (mine && msg.payload.discovered) {
        useGraphStore.getState().merge(msg.payload.discovered);
      }
      break;
    }
    case "LEADERBOARD_CHANGED":
      void queryClient.invalidateQueries({ queryKey: ["leaderboard", gameId] });
      break;
  }
}

export function useGameSocket(target: SocketTarget | null): ConnectionStatus {
  const queryClient = useQueryClient();
  const connectionStatus = useLiveStore((s) => s.connectionStatus);

  const role = target?.role ?? null;
  const gameId = target?.gameId ?? null;
  const teamId = target?.role === "team" ? target.teamId : null;
  const token = target?.role === "team" ? target.token : "";

  useEffect(() => {
    if (role === null || gameId === null) return;

    useLiveStore.getState().resetLive();

    const socket = new GameSocket({ gameId, role, token, WebSocketImpl });

    const unsubs = [
      socket.on("status", (status) => {
        useLiveStore.getState().setConnectionStatus(status);
      }),
      // A seq gap means we missed at least one event, so nothing cached can be
      // trusted: refetch instead of patching.
      socket.on("gap", () => {
        void queryClient.invalidateQueries({ queryKey: ["leaderboard", gameId] });
        if (!teamId) return;
        invalidateTeamQueries(queryClient, teamId);
        void api
          .getTeamGraph(teamId, token)
          .then((graph) => useGraphStore.getState().merge(graph))
          .catch(() => undefined);
      }),
      socket.on("message", (msg: WSMessage) => {
        handleMessage(msg, teamId, gameId, queryClient);
      }),
    ];

    socket.connect();

    return () => {
      for (const off of unsubs) off();
      socket.close();
    };
  }, [role, gameId, teamId, token, queryClient]);

  return connectionStatus;
}
