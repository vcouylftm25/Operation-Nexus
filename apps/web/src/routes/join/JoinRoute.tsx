import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { IS_MOCK, api } from "@/lib/client";
import {
  DEFAULT_SCENARIO_SLUG,
  MOCK_GAME_ID,
  MOCK_HOST_TOKEN,
  MOCK_JOIN_CODE,
} from "@/lib/constants";
import { useSessionStore } from "@/features/game/session";
import { useGraphStore } from "@/features/graph/graphStore";
import { useLiveStore } from "@/features/game/liveStore";

export function JoinRoute() {
  const navigate = useNavigate();
  const setTeamSession = useSessionStore((s) => s.setTeamSession);
  const setHostSession = useSessionStore((s) => s.setHostSession);
  const setScreenSession = useSessionStore((s) => s.setScreenSession);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [joinCode, setJoinCode] = useState(IS_MOCK ? MOCK_JOIN_CODE : "");
  const [hostToken, setHostToken] = useState(IS_MOCK ? MOCK_HOST_TOKEN : "");
  const [scenarioSlug, setScenarioSlug] = useState(DEFAULT_SCENARIO_SLUG);
  const [screenGameId, setScreenGameId] = useState(IS_MOCK ? MOCK_GAME_ID : "");

  async function asTeam(code: string) {
    setBusy(true);
    setError(null);
    try {
      useGraphStore.getState().reset();
      useLiveStore.getState().resetLive();
      const joined = await api.joinTeam(code);
      const state = await api.getTeamState(joined.team_id, joined.session_token);
      setTeamSession({
        gameId: joined.game_id,
        teamId: joined.team_id,
        teamName: state.name,
        sessionToken: joined.session_token,
      });
      navigate("/play");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar na equipe.");
    } finally {
      setBusy(false);
    }
  }

  async function asHost(token: string, slug: string) {
    setBusy(true);
    setError(null);
    try {
      useLiveStore.getState().resetLive();
      let gameId = IS_MOCK ? MOCK_GAME_ID : "";
      if (IS_MOCK) {
        await api.getGame(MOCK_GAME_ID);
        gameId = MOCK_GAME_ID;
      } else {
        const game = await api.createGame(slug);
        gameId = game.game_id;
      }
      setHostSession({ gameId, hostToken: token });
      navigate("/host");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o console do host.");
    } finally {
      setBusy(false);
    }
  }

  function asScreen(gameId: string) {
    useLiveStore.getState().resetLive();
    setScreenSession({ gameId });
    navigate("/screen");
  }

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-6 py-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-nexus-amber">War room · Vero Crédito</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[0.18em] text-nexus-text">OPERATION NEXUS</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-nexus-muted">
        Quatro equipes. Um grafo de fraude. Créditos finitos. Descubra o anel — sem vazá-lo para o time rival.
      </p>

      {IS_MOCK ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button disabled={busy} onClick={() => void asTeam(MOCK_JOIN_CODE)} data-testid="mock-join-team">
            Entrar no simulado
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void asHost(MOCK_HOST_TOKEN, scenarioSlug)}
            data-testid="mock-join-host"
          >
            Console do host (simulado)
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => asScreen(MOCK_GAME_ID)} data-testid="mock-join-screen">
            Projetor (simulado)
          </Button>
        </div>
      ) : null}

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Equipe</CardTitle>
          </CardHeader>
          <form
            className="space-y-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void asTeam(joinCode);
            }}
          >
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Código de 6 caracteres"
              className="font-mono tracking-[0.2em]"
              maxLength={8}
            />
            <Button type="submit" className="w-full" disabled={busy || joinCode.trim().length < 4}>
              Entrar na sala
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Host</CardTitle>
          </CardHeader>
          <form
            className="space-y-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void asHost(hostToken, scenarioSlug);
            }}
          >
            <Input
              type="password"
              value={hostToken}
              onChange={(e) => setHostToken(e.target.value)}
              placeholder="Token do host"
            />
            <Input
              value={scenarioSlug}
              onChange={(e) => setScenarioSlug(e.target.value)}
              placeholder="scenario slug"
              className="font-mono"
            />
            <Button type="submit" variant="outline" className="w-full" disabled={busy || !hostToken.trim()}>
              Abrir console
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projetor</CardTitle>
          </CardHeader>
          <form
            className="space-y-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              asScreen(screenGameId.trim());
            }}
          >
            <Input
              value={screenGameId}
              onChange={(e) => setScreenGameId(e.target.value)}
              placeholder="game id"
              className="font-mono"
            />
            <Button
              type="submit"
              variant="ghost"
              className="w-full"
              disabled={busy || screenGameId.trim().length === 0}
            >
              Ligar tela
            </Button>
          </form>
        </Card>
      </div>

      {error ? <p className="mt-6 text-sm text-nexus-danger">{error}</p> : null}
    </div>
  );
}
