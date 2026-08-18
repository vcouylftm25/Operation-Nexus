import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/Badge";
import { useGameSocket } from "@/features/game/useGameSocket";
import { useLiveStore } from "@/features/game/liveStore";
import { useRoundCountdown } from "@/features/game/useRoundCountdown";
import { useSessionStore, type ScreenSession } from "@/features/game/session";
import { Scoreboard } from "@/features/scoreboard/Scoreboard";
import { api } from "@/lib/client";
import { teamDisplayName } from "@/lib/utils";
import type { ScoreBreakdown } from "@/lib/types";

export function ScreenRoute() {
  const session = useSessionStore((s) => s.session);
  if (!session || session.role !== "screen") {
    return <Navigate to="/" replace />;
  }
  return <Projector session={session} />;
}

function Projector({ session }: { session: ScreenSession }) {
  const live = useGameSocket();
  const round = useLiveStore((s) => s.currentRound);
  const title = useLiveStore((s) => s.roundTitle);
  const narrative = useLiveStore((s) => s.roundNarrative);
  const flashes = useLiveStore((s) => s.flashes);
  const scoresByTeam = useLiveStore((s) => s.scoresByTeam);
  const gameStatus = useLiveStore((s) => s.gameStatus);
  const { label } = useRoundCountdown();

  const gameQuery = useQuery({
    queryKey: ["game", session.gameId],
    queryFn: () => api.getGame(session.gameId),
  });

  useEffect(() => {
    if (flashes.length === 0) return;
    const last = flashes[flashes.length - 1];
    if (!last) return;
    const timer = window.setTimeout(() => useLiveStore.getState().dismissFlash(last.id), 4200);
    return () => window.clearTimeout(timer);
  }, [flashes]);

  const teams = gameQuery.data?.teams ?? [];
  const rows: ScoreBreakdown[] = Object.values(scoresByTeam).map((row) => ({
    team_id: row.team_id,
    events: row.events,
    total: row.total,
  }));
  if (rows.length === 0) {
    for (const team of teams) {
      rows.push({ team_id: team.team_id, events: [], total: 0 });
    }
  }

  const currentRound = round || gameQuery.data?.current_round || 0;

  return (
    <div className="relative flex h-full min-h-0 flex-col px-10 py-8">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.32em] text-nexus-amber">Projetor</p>
          <h1 className="mt-2 text-5xl font-semibold tracking-[0.16em]">OPERATION NEXUS</h1>
          <p className="mt-3 max-w-2xl text-lg text-nexus-muted">{title ?? narrative}</p>
        </div>
        <div className="text-right">
          <Badge tone={live === "open" ? "live" : "danger"}>{live === "open" ? "LIVE" : "OFFLINE"}</Badge>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-nexus-muted">Round</p>
          <p className="font-mono text-7xl text-nexus-amber tabular-nums">{currentRound}</p>
          <p className="font-mono text-5xl text-nexus-text tabular-nums">{label}</p>
          {gameStatus === "FINISHED" ? (
            <p className="mt-2 font-mono text-sm uppercase tracking-[0.2em] text-nexus-danger">Encerrado</p>
          ) : null}
        </div>
      </header>

      <div className="mt-10 min-h-0 flex-1">
        <p className="mb-4 font-mono text-[12px] uppercase tracking-[0.24em] text-nexus-muted">Placar</p>
        <div className="max-w-3xl text-lg">
          <Scoreboard rows={rows} teams={teams} compact />
        </div>
      </div>

      <div className="pointer-events-none absolute top-8 right-10 flex flex-col items-end gap-2">
        {flashes.map((flash) => (
          <div
            key={flash.id}
            className="nexus-toast pointer-events-auto rounded-sm border border-nexus-signal/40 bg-[#121826]/90 px-4 py-3 text-sm text-nexus-signal shadow-xl"
          >
            {teamDisplayName(teams, flash.teamId, flash.teamName)} descobriu {flash.nodeCount} nós
          </div>
        ))}
      </div>
    </div>
  );
}
