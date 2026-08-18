import { Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/Badge";
import { useGameSocket } from "@/features/game/useGameSocket";
import { api } from "@/lib/client";
import { formatClock } from "@/lib/utils";
import type { LeaderboardRow, TeamStatus } from "@/lib/types";

/** The projector has no session and no socket guarantees, so it also polls. */
const POLL_MS = 5_000;

export function ScreenRoute() {
  const { gameId } = useParams();
  if (!gameId) return <Navigate to="/" replace />;
  return <Projector gameId={gameId} />;
}

function statusLabel(status: TeamStatus): string {
  if (status === "SOLVED") return "Resolveu";
  if (status === "FAILED") return "Sem tentativas";
  return "Investigando";
}

function statusTone(status: TeamStatus): "live" | "danger" | "amber" {
  if (status === "SOLVED") return "live";
  if (status === "FAILED") return "danger";
  return "amber";
}

function Projector({ gameId }: { gameId: string }) {
  const live = useGameSocket({ role: "screen", gameId });
  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard", gameId],
    queryFn: () => api.getLeaderboard(gameId),
    refetchInterval: POLL_MS,
  });

  const rows = leaderboardQuery.data ?? [];
  const solved = rows.filter((row) => row.status === "SOLVED").length;

  return (
    <div className="flex h-full min-h-0 flex-col px-10 py-8">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.32em] text-nexus-amber">
            Placar da sala
          </p>
          <h1 className="mt-2 text-5xl font-semibold tracking-[0.16em]">OPERATION NEXUS</h1>
          <p className="mt-3 max-w-3xl text-lg text-nexus-muted">
            Quem resolveu vem primeiro. Depois, mais pontos na frente — o tempo só desempata.
          </p>
        </div>
        <div className="text-right">
          <Badge tone={live === "open" ? "live" : "danger"}>
            {live === "open" ? "AO VIVO" : "SEM CONEXÃO"}
          </Badge>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-nexus-muted">
            Equipes que resolveram
          </p>
          <p className="font-mono text-6xl text-nexus-amber tabular-nums">
            {solved}
            <span className="text-nexus-muted">/{rows.length}</span>
          </p>
        </div>
      </header>

      <div className="mt-10 min-h-0 flex-1 overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-xl text-nexus-muted">
            Nenhuma equipe entrou ainda. Digitem um nome de equipe para começar.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <LeaderboardLine key={row.team_id} row={row} position={index + 1} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function LeaderboardLine({ row, position }: { row: LeaderboardRow; position: number }) {
  const leading = position === 1 && row.status === "SOLVED";
  return (
    <li
      className={`grid grid-cols-[64px_minmax(0,1fr)_190px_120px_170px_140px] items-center gap-5 rounded-sm border px-5 py-4 ${
        leading
          ? "border-nexus-signal/50 bg-nexus-signal/10"
          : "border-nexus-border bg-white/[0.02]"
      }`}
    >
      <span className="font-mono text-3xl text-nexus-muted tabular-nums">
        {String(position).padStart(2, "0")}
      </span>
      <span className="truncate text-3xl font-semibold text-nexus-text">{row.team_name}</span>
      <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
      <span className="font-mono text-3xl text-nexus-amber tabular-nums">{row.score}</span>
      <span className="font-mono text-lg whitespace-nowrap text-nexus-muted tabular-nums">
        {row.attempts_used} {row.attempts_used === 1 ? "tentativa" : "tentativas"}
      </span>
      <span className="text-right font-mono text-xl whitespace-nowrap text-nexus-muted tabular-nums">
        {row.elapsed_seconds === null ? `fase ${row.current_round}` : formatClock(row.elapsed_seconds)}
      </span>
    </li>
  );
}
