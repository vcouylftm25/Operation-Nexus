import { cn, teamDisplayName } from "@/lib/utils";
import type { ScoreBreakdown, ScoreEvent, TeamState } from "@/lib/types";

interface ScoreboardProps {
  rows: ScoreBreakdown[];
  teams?: Pick<TeamState, "team_id" | "name">[];
  compact?: boolean;
}

export function Scoreboard({ rows, teams = [], compact = false }: ScoreboardProps) {
  const sorted = [...rows].sort((a, b) => b.total - a.total);

  if (sorted.length === 0) {
    return <p className="text-sm text-nexus-muted">Nenhuma pontuação ainda.</p>;
  }

  return (
    <ol className="space-y-2">
      {sorted.map((row, index) => (
        <li
          key={row.team_id}
          className={cn(
            "rounded-sm border border-nexus-border bg-nexus-bg/40 px-3 py-2",
            index === 0 && "border-nexus-amber/40",
          )}
        >
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                <span className="mr-2 font-mono text-nexus-muted">{index + 1}</span>
                {teamDisplayName(teams, row.team_id, row.team_id)}
              </p>
              {!compact && row.events.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {row.events.map((event, i) => (
                    <ScoreLine key={`${event.rule}-${i}`} event={event} />
                  ))}
                </ul>
              ) : null}
            </div>
            <p
              className={cn(
                "font-mono text-xl font-semibold tabular-nums",
                row.total >= 0 ? "text-nexus-amber" : "text-nexus-danger",
              )}
            >
              {row.total}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ScoreLine({ event }: { event: ScoreEvent }) {
  return (
    <li className="flex justify-between gap-3 font-mono text-[11px] text-nexus-muted">
      <span className="truncate">{event.detail || event.rule}</span>
      <span className={event.delta >= 0 ? "text-nexus-signal" : "text-nexus-danger"}>
        {event.delta >= 0 ? "+" : ""}
        {event.delta}
      </span>
    </li>
  );
}
