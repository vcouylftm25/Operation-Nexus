import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { NexusHeader } from "@/components/layout/NexusHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { CaseDocket } from "@/features/evidence/CaseDocket";
import { EvidenceDrawer } from "@/features/evidence/EvidenceDrawer";
import { HypothesisBoard } from "@/features/game/HypothesisBoard";
import { MissionBrief } from "@/features/game/MissionBrief";
import { TutorialOverlay } from "@/features/game/TutorialOverlay";
import { useGameSocket } from "@/features/game/useGameSocket";
import { useLiveStore } from "@/features/game/liveStore";
import { useRoundCountdown } from "@/features/game/useRoundCountdown";
import { useSessionStore, type TeamSession } from "@/features/game/session";
import { GraphCanvas } from "@/features/graph/GraphCanvas";
import { useGraphStore } from "@/features/graph/graphStore";
import { useNxThemeStore } from "@/features/graph/nxTheme";
import { InvestigatorPanel } from "@/features/investigation/InvestigatorPanel";
import { useInvestigatorSession } from "@/features/investigation/useInvestigatorSession";
import { api } from "@/lib/client";

export function PlayRoute() {
  const session = useSessionStore((s) => s.session);
  if (!session || session.role !== "team") return <Navigate to="/" replace />;
  return <PlayWarRoom session={session} />;
}

function PlayWarRoom({ session }: { session: TeamSession }) {
  const live = useGameSocket();
  const round = useLiveStore((s) => s.currentRound);
  const { label: countdown } = useRoundCountdown();
  const nxTheme = useNxThemeStore((s) => s.theme);
  const investigatorSession = useInvestigatorSession(session.teamId, session.sessionToken);
  const teamQuery = useQuery({ queryKey: ["team", session.teamId], queryFn: () => api.getTeamState(session.teamId, session.sessionToken) });
  const graphQuery = useQuery({ queryKey: ["graph", session.teamId], queryFn: () => api.getTeamGraph(session.teamId, session.sessionToken) });
  const docketQuery = useQuery({ queryKey: ["docket", session.teamId], queryFn: () => api.getDocket(session.teamId, session.sessionToken) });
  const revealsQuery = useQuery({ queryKey: ["reveals", session.teamId], queryFn: () => api.getTeamReveals(session.teamId, session.sessionToken) });
  const gameQuery = useQuery({ queryKey: ["game", session.gameId], queryFn: () => api.getGame(session.gameId) });

  useEffect(() => { useGraphStore.getState().reset(); }, [session.teamId]);
  useEffect(() => { if (graphQuery.data) useGraphStore.getState().merge(graphQuery.data); }, [graphQuery.data]);
  useEffect(() => { if (revealsQuery.data) useLiveStore.getState().hydrateEvidence(revealsQuery.data); }, [revealsQuery.data]);
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

  const displayRound = round || teamQuery.data?.current_round || 1;
  const displayCredits = teamQuery.data?.credits_balance ?? 0;
  const title = useLiveStore((s) => s.roundTitle);
  const graphUnlocked = displayRound >= 2;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#070a0f]">
      <TutorialOverlay storageKey={`nexus-tutorial-${session.teamId}`} />
      <NexusHeader subtitle={session.teamName} round={displayRound} live={live} right={<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-muted">Equipe privada</span>} />
      <MissionBrief round={displayRound} title={title} credits={displayCredits} countdown={countdown} />
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_360px]">
        <section className="flex min-h-0 flex-col border-r border-white/[0.07] bg-[#0b0f16]">
          <Tabs defaultValue="docket" className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-white/[0.07] px-3 py-2.5"><TabsList><TabsTrigger value="docket">Casos</TabsTrigger><TabsTrigger value="evidence">Evidências</TabsTrigger></TabsList></div>
            <TabsContent value="docket" className="mt-0 flex min-h-0 flex-1 flex-col"><CaseDocket files={docketQuery.data ?? []} teamId={session.teamId} sessionToken={session.sessionToken} /></TabsContent>
            <TabsContent value="evidence" className="mt-0 min-h-0 flex-1 overflow-hidden"><EvidenceDrawer embedded /></TabsContent>
          </Tabs>
        </section>
        <div className="nx-scope contents" data-nx-theme={nxTheme}>
          <section className="relative min-h-0">
            {graphUnlocked ? (
              <GraphCanvas onCommand={investigatorSession.submit} pending={investigatorSession.pending} />
            ) : (
              <div className="flex h-full items-center justify-center px-12" style={{ background: "var(--nx-card)" }}><div className="max-w-lg text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] font-mono text-xs text-nexus-muted">R1</div><p className="mt-6 font-mono text-[10px] uppercase tracking-[0.24em] text-nexus-amber">Contexto relacional bloqueado</p><h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-white">Primeiro, julgue os indivíduos.</h2><p className="mt-3 text-sm leading-6 text-nexus-muted">Neste round vocês têm apenas os dossiês. Escolham onde gastar inteligência sem saber quem está conectado a quem.</p><div className="mx-auto mt-6 h-px w-28 bg-gradient-to-r from-transparent via-white/20 to-transparent" /><p className="mt-5 text-xs text-nexus-muted">As relações entram no caso no próximo round.</p></div></div>
            )}
          </section>
          <InvestigatorPanel session={investigatorSession} credits={displayCredits} />
        </div>
      </div>
      <div className="h-[210px] shrink-0 border-t border-white/[0.07] bg-[#090d13]"><HypothesisBoard teamId={session.teamId} sessionToken={session.sessionToken} /></div>
    </div>
  );
}
