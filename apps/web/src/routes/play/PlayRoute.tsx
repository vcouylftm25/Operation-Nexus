import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { NexusHeader } from "@/components/layout/NexusHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { CaseDocket } from "@/features/evidence/CaseDocket";
import { EvidenceDrawer } from "@/features/evidence/EvidenceDrawer";
import { HypothesisBoard } from "@/features/game/HypothesisBoard";
import { useGameSocket } from "@/features/game/useGameSocket";
import { useLiveStore } from "@/features/game/liveStore";
import { useRoundCountdown } from "@/features/game/useRoundCountdown";
import { useSessionStore, type TeamSession } from "@/features/game/session";
import { GraphCanvas } from "@/features/graph/GraphCanvas";
import { useGraphStore } from "@/features/graph/graphStore";
import { InvestigatorPanel } from "@/features/investigation/InvestigatorPanel";
import { api } from "@/lib/client";

export function PlayRoute() {
  const session = useSessionStore((s) => s.session);
  if (!session || session.role !== "team") {
    return <Navigate to="/" replace />;
  }
  return <PlayWarRoom session={session} />;
}

function PlayWarRoom({ session }: { session: TeamSession }) {
  const live = useGameSocket();
  const round = useLiveStore((s) => s.currentRound);
  const { label: countdown } = useRoundCountdown();

  const teamQuery = useQuery({
    queryKey: ["team", session.teamId],
    queryFn: () => api.getTeamState(session.teamId, session.sessionToken),
  });

  const graphQuery = useQuery({
    queryKey: ["graph", session.teamId],
    queryFn: () => api.getTeamGraph(session.teamId, session.sessionToken),
  });

  const docketQuery = useQuery({
    queryKey: ["docket", session.teamId],
    queryFn: () => api.getDocket(session.teamId, session.sessionToken),
  });

  const gameQuery = useQuery({
    queryKey: ["game", session.gameId],
    queryFn: () => api.getGame(session.gameId),
  });

  useEffect(() => {
    useGraphStore.getState().reset();
  }, [session.teamId]);

  useEffect(() => {
    if (graphQuery.data) useGraphStore.getState().merge(graphQuery.data);
  }, [graphQuery.data]);

  useEffect(() => {
    if (!teamQuery.data) return;
    const active = gameQuery.data?.rounds.find((item) => item.number === teamQuery.data.current_round);
    useLiveStore.getState().hydrateFromGame({
      currentRound: teamQuery.data.current_round,
      status: gameQuery.data?.status ?? "ACTIVE",
      title: active?.title ?? null,
      narrative: active?.narrative ?? null,
      durationSeconds: active?.duration_seconds ?? null,
      startedAt: active?.started_at ?? null,
    });
  }, [gameQuery.data, teamQuery.data]);

  const displayRound = round || teamQuery.data?.current_round || 0;
  const displayCredits = teamQuery.data?.credits_balance ?? 0;
  const title = useLiveStore((s) => s.roundTitle);
  const narrative = useLiveStore((s) => s.roundNarrative);

  return (
    <div className="grid h-full min-h-0 grid-rows-[56px_auto_minmax(0,1fr)_220px]">
      <NexusHeader
        subtitle={session.teamName}
        credits={displayCredits}
        round={displayRound}
        live={live}
        right={<span className="font-mono text-sm tabular-nums text-nexus-muted">{countdown}</span>}
      />
      {title ? (
        <div className="border-b border-nexus-border bg-nexus-bg-alt/80 px-5 py-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-nexus-amber">{title}</p>
          {narrative ? (
            <p className="mt-1 max-w-4xl text-xs leading-relaxed text-nexus-muted">{narrative}</p>
          ) : null}
        </div>
      ) : (
        <div />
      )}
      <div className="grid min-h-0 grid-cols-[320px_minmax(0,1fr)_380px]">
        <section className="nexus-panel flex min-h-0 flex-col rounded-none border-y-0 border-l-0">
          <Tabs defaultValue="docket" className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-nexus-border px-3 py-2">
              <TabsList>
                <TabsTrigger value="docket">Dossiês</TabsTrigger>
                <TabsTrigger value="evidence">Evidências</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="docket" className="mt-0 flex min-h-0 flex-1 flex-col">
              <CaseDocket
                files={docketQuery.data ?? []}
                teamId={session.teamId}
                sessionToken={session.sessionToken}
              />
            </TabsContent>
            <TabsContent value="evidence" className="mt-0 min-h-0 flex-1 overflow-hidden">
              <EvidenceDrawer embedded />
            </TabsContent>
          </Tabs>
        </section>
        <section className="relative min-h-0 border-x border-nexus-border bg-[#0c1018]/70">
          <p className="pointer-events-none absolute top-3 left-4 z-10 font-mono text-[11px] uppercase tracking-[0.22em] text-nexus-muted">
            Grafo
          </p>
          <GraphCanvas />
        </section>
        <InvestigatorPanel
          teamId={session.teamId}
          sessionToken={session.sessionToken}
          credits={displayCredits}
        />
      </div>
      <HypothesisBoard teamId={session.teamId} sessionToken={session.sessionToken} />
    </div>
  );
}
