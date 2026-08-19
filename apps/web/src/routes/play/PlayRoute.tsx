import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NexusHeader } from "@/components/layout/NexusHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { CaseDocket } from "@/features/evidence/CaseDocket";
import { EvidenceDrawer } from "@/features/evidence/EvidenceDrawer";
import { GuessPanel } from "@/features/game/GuessPanel";
import { HintsShelf } from "@/features/game/HintsShelf";
import { PhaseBanner } from "@/features/game/PhaseBanner";
import { TutorialOverlay } from "@/features/game/TutorialOverlay";
import { useGameSocket } from "@/features/game/useGameSocket";
import { useSessionStore, type TeamSession } from "@/features/game/session";
import { GraphCanvas } from "@/features/graph/GraphCanvas";
import { GraphInspector } from "@/features/graph/GraphInspector";
import { useGraphStore } from "@/features/graph/graphStore";
import { useGraphViewStore } from "@/features/graph/graphViewStore";
import { InvestigationBoard } from "@/features/graph/InvestigationBoard";
import { useNxThemeStore } from "@/features/graph/nxTheme";
import { useLayoutMode } from "@/features/graph/useLayoutMode";
import { InvestigatorPanel } from "@/features/investigation/InvestigatorPanel";
import { ConfirmSpendDialog } from "@/features/investigation/ConfirmSpendDialog";
import { useInvestigatorSession } from "@/features/investigation/useInvestigatorSession";
import { ApiError, api } from "@/lib/client";
import type { AdvancePhaseResponse, TeamState } from "@/lib/types";

export function PlayRoute() {
  const session = useSessionStore((s) => s.session);
  if (!session) return <Navigate to="/" replace />;
  return <PlayWarRoom key={session.team_id} session={session} />;
}

function PlayWarRoom({ session }: { session: TeamSession }) {
  const { team_id: teamId, game_id: gameId, session_token: token } = session;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const nxTheme = useNxThemeStore((s) => s.theme);
  const live = useGameSocket({ role: "team", gameId, teamId, token });
  const investigatorSession = useInvestigatorSession(teamId, token);
  const [advanceBlocked, setAdvanceBlocked] = useState<string | null>(null);

  const layout = useLayoutMode();
  const caseRailIsDrawer = layout === "compact";
  const assistantIsDrawer = layout !== "wide";
  const [caseRailOpen, setCaseRailOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  // Docked rails can be folded away to give the canvas the whole width; the
  // drawer layouts already hide them, so this only applies when they're docked.
  const [caseRailFolded, setCaseRailFolded] = useState(false);
  const [assistantFolded, setAssistantFolded] = useState(false);
  const caseRailDocked = !caseRailIsDrawer && !caseRailFolded;
  const assistantDocked = !assistantIsDrawer && !assistantFolded;

  const hasSelection = useGraphStore((s) => s.selectedIds.length === 1 || s.selectedEdgeId !== null);

  const teamQuery = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.getTeamState(teamId, token),
  });
  const gameQuery = useQuery({ queryKey: ["game", gameId], queryFn: () => api.getGame(gameId) });
  const graphQuery = useQuery({
    queryKey: ["graph", teamId],
    queryFn: () => api.getTeamGraph(teamId, token),
  });
  const docketQuery = useQuery({
    queryKey: ["docket", teamId],
    queryFn: () => api.getDocket(teamId, token),
  });

  useEffect(() => {
    useGraphStore.getState().reset();
    useGraphStore.getState().bindTeam(teamId);
    useGraphViewStore.getState().resetView();
  }, [teamId]);

  useEffect(() => {
    if (graphQuery.data) useGraphStore.getState().merge(graphQuery.data);
  }, [graphQuery.data]);

  // Selecting something has to bring the Inspector with it, otherwise the
  // detail lands in a rail the player folded away or never opened.
  useEffect(
    () =>
      useGraphStore.subscribe((state, previous) => {
        const selectedNow = state.selectedIds.length === 1 || state.selectedEdgeId !== null;
        const selectedBefore =
          previous.selectedIds.length === 1 || previous.selectedEdgeId !== null;
        if (!selectedNow || selectedBefore) return;
        if (caseRailIsDrawer) setCaseRailOpen(true);
        else setCaseRailFolded(false);
      }),
    [caseRailIsDrawer],
  );

  const advance = useMutation({
    mutationFn: () => api.advancePhase(teamId, token),
    onSuccess: (result: AdvancePhaseResponse) => {
      setAdvanceBlocked(null);
      queryClient.setQueryData<TeamState>(["team", teamId], result.team);
      void queryClient.invalidateQueries({ queryKey: ["graph", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["docket", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["hints", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["suspects", teamId] });
    },
    onError: (err: unknown) => {
      setAdvanceBlocked(
        err instanceof ApiError && err.status === 409
          ? "Esta já é a última fase."
          : "Não foi possível avançar agora. Tentem de novo em alguns segundos.",
      );
      void queryClient.invalidateQueries({ queryKey: ["team", teamId] });
    },
  });

  // A stale token (a game that was reset, say) can only be fixed by starting
  // over from the entry screen, so bounce instead of showing an empty console.
  const unauthorized = teamQuery.error instanceof ApiError && teamQuery.error.status === 401;
  useEffect(() => {
    if (!unauthorized) return;
    useSessionStore.getState().clear();
    navigate("/", { replace: true });
  }, [unauthorized, navigate]);

  const team = teamQuery.data;
  const rounds = gameQuery.data?.rounds ?? [];
  const finalPhase = rounds.length > 0 ? Math.max(...rounds.map((round) => round.number)) : 3;
  const phase = team?.current_round ?? 1;
  const briefing = rounds.find((round) => round.number === phase) ?? null;
  const credits = team?.credits_balance ?? 0;
  const resolved = team ? team.status !== "PLAYING" : false;

  const canAdvance = phase < finalPhase && !resolved && advanceBlocked === null;
  const blockedReason = advanceBlocked
    ? advanceBlocked
    : resolved
      ? "A investigação de vocês está encerrada."
      : "Vocês já estão na última fase — é aqui que a acusação acontece.";

  // The Inspector covers the rail instead of replacing it, so closing it drops
  // the team back on the tab they were reading.
  const caseRail = (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Tabs defaultValue="docket" className="flex min-h-0 flex-1 flex-col">
        <div style={{ borderBottom: "1px solid var(--nx-line)", padding: "10px 12px" }}>
          <TabsList>
            <TabsTrigger value="docket">Casos</TabsTrigger>
            <TabsTrigger value="evidence">Evidências</TabsTrigger>
            <TabsTrigger value="hints">Dicas</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="docket" className="mt-0 flex min-h-0 flex-1 flex-col">
          <CaseDocket files={docketQuery.data ?? []} teamId={teamId} sessionToken={token} />
        </TabsContent>
        <TabsContent value="evidence" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <EvidenceDrawer embedded />
        </TabsContent>
        <TabsContent value="hints" className="mt-0 flex min-h-0 flex-1 flex-col">
          <HintsShelf teamId={teamId} sessionToken={token} />
        </TabsContent>
      </Tabs>
      {hasSelection ? (
        <div
          className="absolute inset-0 flex min-h-0 flex-col"
          style={{ background: "var(--nx-surface)" }}
        >
          <GraphInspector onCommand={investigatorSession.submit} />
        </div>
      ) : null}
    </div>
  );

  const assistant = <InvestigatorPanel session={investigatorSession} credits={credits} />;

  return (
    <div
      className="nx-scope flex h-full min-h-0 flex-col"
      data-nx-theme={nxTheme}
      style={{ background: "var(--nx-bg)" }}
    >
      <TutorialOverlay storageKey={`nexus-tutorial-${teamId}`} />
      <ConfirmSpendDialog
        spend={investigatorSession.awaitingConfirmation}
        balance={credits}
        onConfirm={investigatorSession.confirmSpend}
        onCancel={investigatorSession.cancelSpend}
      />
      <NexusHeader
        variant="nx"
        subtitle={session.team_name}
        round={phase}
        live={live}
        right={
          <button
            type="button"
            onClick={() => navigate(`/screen/${gameId}`)}
            style={{
              padding: "5px 10px",
              border: "1px solid var(--nx-line-2)",
              borderRadius: 8,
              background: "transparent",
              cursor: "pointer",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              letterSpacing: "0.12em",
              color: "var(--nx-muted)",
            }}
          >
            PLACAR
          </button>
        }
      />
      <PhaseBanner
        phase={phase}
        totalPhases={finalPhase}
        title={briefing?.title ?? null}
        narrative={briefing?.narrative ?? null}
        credits={credits}
        canAdvance={canAdvance}
        advancing={advance.isPending}
        onAdvance={() => advance.mutate()}
        blockedReason={blockedReason}
        briefingOpen={layout === "wide"}
      />

      <div className="relative flex min-h-0 flex-1">
        {caseRailDocked ? (
          <aside
            className="flex min-h-0 shrink-0 flex-col"
            style={{
              width: layout === "wide" ? 304 : 272,
              borderRight: "1px solid var(--nx-line)",
              background: "var(--nx-surface)",
            }}
          >
            {caseRail}
          </aside>
        ) : null}

        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {caseRailIsDrawer ? null : (
            <RailFoldHandle
              side="left"
              folded={caseRailFolded}
              onToggle={() => setCaseRailFolded((folded) => !folded)}
              label="painel de casos"
              testId="fold-case-rail"
            />
          )}
          {assistantIsDrawer ? null : (
            <RailFoldHandle
              side="right"
              folded={assistantFolded}
              onToggle={() => setAssistantFolded((folded) => !folded)}
              label="painel da Vera"
              testId="fold-assistant"
            />
          )}
          {caseRailIsDrawer || assistantIsDrawer ? (
            <div
              className="flex shrink-0 flex-wrap items-center gap-2"
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--nx-line)",
                background: "var(--nx-surface)",
              }}
            >
              {caseRailIsDrawer ? (
                <button
                  type="button"
                  onClick={() => setCaseRailOpen(true)}
                  style={railButtonStyle}
                  data-testid="open-case-rail"
                >
                  {hasSelection ? "DETALHES" : "CASOS · DICAS"}
                </button>
              ) : null}
              {assistantIsDrawer ? (
                <button
                  type="button"
                  onClick={() => setAssistantOpen(true)}
                  style={railButtonStyle}
                  data-testid="open-assistant"
                >
                  VERA
                </button>
              ) : null}
              <span style={{ fontSize: 10.5, color: "var(--nx-muted)" }}>
                {credits} créditos
              </span>
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
            <GraphCanvas
              onCommand={investigatorSession.submit}
              pending={investigatorSession.pending}
              phase={phase}
            />
          </div>
        </section>

        {assistantDocked ? (
          <aside className="flex min-h-0 shrink-0 flex-col" style={{ width: 344 }}>
            {assistant}
          </aside>
        ) : null}

        {caseRailIsDrawer && caseRailOpen ? (
          <RailDrawer side="left" onClose={() => setCaseRailOpen(false)}>
            {caseRail}
          </RailDrawer>
        ) : null}
        {assistantIsDrawer && assistantOpen ? (
          <RailDrawer side="right" onClose={() => setAssistantOpen(false)}>
            {assistant}
          </RailDrawer>
        ) : null}
      </div>

      <div
        className="flex shrink-0 flex-wrap items-stretch"
        style={{ borderTop: "1px solid var(--nx-line)", background: "var(--nx-surface)" }}
      >
        <div style={{ borderRight: "1px solid var(--nx-line)" }}>
          <InvestigationBoard />
        </div>
        <div className="min-w-[280px] flex-1">
          <GuessPanel
            teamId={teamId}
            sessionToken={token}
            currentPhase={phase}
            finalPhase={finalPhase}
            status={team?.status ?? "PLAYING"}
            attemptsUsed={team?.attempts_used ?? 0}
            startedAt={team?.started_at ?? null}
            solvedAt={team?.solved_at ?? null}
          />
        </div>
      </div>
    </div>
  );
}

const railButtonStyle = {
  padding: "6px 11px",
  border: "1px solid var(--nx-line-2)",
  borderRadius: 8,
  background: "var(--nx-card)",
  cursor: "pointer",
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 10,
  letterSpacing: "0.12em",
  color: "var(--nx-muted)",
} as const;

/** Fold/unfold tab that rides the seam between the canvas and a docked rail. */
function RailFoldHandle({
  side,
  folded,
  onToggle,
  label,
  testId,
}: {
  side: "left" | "right";
  folded: boolean;
  onToggle: () => void;
  label: string;
  testId: string;
}) {
  const pointsAway = side === "left" ? folded : !folded;
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid={testId}
      title={folded ? `Mostrar ${label}` : `Recolher ${label}`}
      aria-label={folded ? `Mostrar ${label}` : `Recolher ${label}`}
      style={{
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        left: side === "left" ? 0 : undefined,
        right: side === "right" ? 0 : undefined,
        zIndex: 10,
        width: 18,
        height: 54,
        display: "grid",
        placeItems: "center",
        padding: 0,
        cursor: "pointer",
        border: "1px solid var(--nx-accent-30)",
        borderLeft: side === "left" ? "none" : undefined,
        borderRight: side === "right" ? "none" : undefined,
        borderRadius: side === "left" ? "0 8px 8px 0" : "8px 0 0 8px",
        background: "var(--nx-accent-06)",
        color: "var(--nx-accent-text)",
        boxShadow: `${side === "left" ? "" : "-"}2px 0 10px var(--nx-shadow-2)`,
        fontSize: 13,
        lineHeight: 1,
      }}
    >
      {pointsAway ? "›" : "‹"}
    </button>
  );
}

function RailDrawer({
  side,
  onClose,
  children,
}: {
  side: "left" | "right";
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Fechar painel"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 20,
          border: "none",
          cursor: "default",
          background: "var(--nx-backdrop)",
        }}
      />
      <aside
        className="flex min-h-0 flex-col"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: side === "left" ? 0 : undefined,
          right: side === "right" ? 0 : undefined,
          zIndex: 21,
          width: "min(92%, 344px)",
          background: "var(--nx-surface)",
          borderRight: side === "left" ? "1px solid var(--nx-line)" : undefined,
          borderLeft: side === "right" ? "1px solid var(--nx-line)" : undefined,
          boxShadow: "0 24px 60px var(--nx-shadow-3)",
          animation: "nxRise .22s cubic-bezier(.22,1,.36,1)",
        }}
      >
        <div
          className="flex shrink-0 justify-end"
          style={{ padding: "8px 10px 0" }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{ ...railButtonStyle, padding: "4px 9px" }}
            data-testid="close-rail-drawer"
          >
            FECHAR ✕
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
