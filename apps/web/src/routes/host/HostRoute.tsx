import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { NexusHeader } from "@/components/layout/NexusHeader";
import { HostControls } from "@/features/host/HostControls";
import { Scoreboard } from "@/features/scoreboard/Scoreboard";
import { useGameSocket } from "@/features/game/useGameSocket";
import { useLiveStore } from "@/features/game/liveStore";
import { useRoundCountdown } from "@/features/game/useRoundCountdown";
import { useSessionStore, type HostSession } from "@/features/game/session";
import { api, IS_MOCK } from "@/lib/client";
import { MOCK_HOST_TOKEN } from "@/lib/constants";

export function HostRoute() {
  const session = useSessionStore((s) => s.session);
  if (!session || session.role !== "host") {
    return <HostGate />;
  }
  return <HostConsole session={session} />;
}

function HostGate() {
  const setHostSession = useSessionStore((s) => s.setHostSession);
  const [gameId, setGameId] = useState("");
  const [token, setToken] = useState(IS_MOCK ? MOCK_HOST_TOKEN : "");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!gameId.trim() || !token.trim()) return;
    setHostSession({ gameId: gameId.trim(), hostToken: token.trim() });
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Acesso do host</CardTitle>
        </CardHeader>
        <p className="mb-4 font-sans text-lg tracking-[0.18em]">OPERATION NEXUS</p>
        <form className="space-y-3" onSubmit={onSubmit}>
          <Input
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            placeholder="game id"
            className="font-mono"
          />
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token do host"
          />
          <Button type="submit" className="w-full">
            Entrar no console
          </Button>
        </form>
      </Card>
    </div>
  );
}

function HostConsole({ session }: { session: HostSession }) {
  const live = useGameSocket();
  const round = useLiveStore((s) => s.currentRound);
  const title = useLiveStore((s) => s.roundTitle);
  const narrative = useLiveStore((s) => s.roundNarrative);
  const { label } = useRoundCountdown();
  const scoresByTeam = useLiveStore((s) => s.scoresByTeam);

  const gameQuery = useQuery({
    queryKey: ["game", session.gameId],
    queryFn: () => api.getGame(session.gameId),
  });

  const boardQuery = useQuery({
    queryKey: ["scoreboard", session.gameId],
    queryFn: () => api.getScoreboard(session.gameId, session.hostToken),
  });

  const currentRound = round || gameQuery.data?.current_round || 0;
  const liveRows = Object.values(scoresByTeam);
  const rows = boardQuery.data && boardQuery.data.length > 0 ? boardQuery.data : liveRows;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <NexusHeader subtitle="HOST" round={currentRound} live={live} />
      <div className="grid min-h-0 flex-1 gap-4 overflow-auto p-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Rodada</CardTitle>
            <p className="font-mono text-4xl text-nexus-amber tabular-nums">{label}</p>
          </CardHeader>
          <p className="text-xl font-medium">{title ?? gameQuery.data?.scenario_slug}</p>
          <p className="mt-2 text-sm leading-relaxed text-nexus-muted">{narrative}</p>
          <div className="mt-6">
            <HostControls
              gameId={session.gameId}
              hostToken={session.hostToken}
              currentRound={currentRound}
            />
          </div>
          <p className="mt-4 font-mono text-[11px] text-nexus-muted">game {session.gameId}</p>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Placar</CardTitle>
          </CardHeader>
          <Scoreboard rows={rows} teams={gameQuery.data?.teams} />
        </Card>
      </div>
    </div>
  );
}
