import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiError, IS_MOCK, api } from "@/lib/client";
import { MOCK_TEAM_NAME } from "@/lib/constants";
import { useSessionStore } from "@/features/game/session";
import { useGraphStore } from "@/features/graph/graphStore";
import { useLiveStore } from "@/features/game/liveStore";

/** Long enough for the "retomamos de onde vocês pararam" line to be read. */
const RESUME_NOTICE_MS = 1600;

export function JoinRoute() {
  const navigate = useNavigate();
  const setSession = useSessionStore((s) => s.setSession);
  const savedSession = useSessionStore((s) => s.session);
  const [teamName, setTeamName] = useState(IS_MOCK ? MOCK_TEAM_NAME : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumedNotice, setResumedNotice] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function start(event: FormEvent) {
    event.preventDefault();
    const name = teamName.trim();
    if (!name || busy) return;

    setBusy(true);
    setError(null);
    try {
      // A different team may have played in this tab before; the graph is
      // accumulated client-side, so it has to go before the new run starts.
      useGraphStore.getState().reset();
      useLiveStore.getState().resetLive();

      const started = await api.startPlay(name);
      setSession({
        team_id: started.team.team_id,
        game_id: started.team.game_id,
        session_token: started.session_token,
        team_name: started.team.name,
      });

      if (started.resumed) {
        setResumedNotice(true);
        timerRef.current = window.setTimeout(() => navigate("/play"), RESUME_NOTICE_MS);
        return;
      }
      navigate("/play");
    } catch (err) {
      setError(startFailureMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-6 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-nexus-amber">
        Investigação de fraude · Vero Express
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[0.16em] text-nexus-text">
        OPERATION NEXUS
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-nexus-muted">
        Oito clientes, uma proposta de crédito suspeita e uma rede de conexões que só aparece se
        vocês investigarem. Três fases, no ritmo da sua equipe — no fim, vocês apontam quem
        coordenou o esquema.
      </p>

      <form className="mt-9 space-y-3" onSubmit={(event) => void start(event)}>
        <label
          htmlFor="team-name"
          className="block font-mono text-[11px] uppercase tracking-[0.2em] text-nexus-muted"
        >
          Nome da equipe
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            id="team-name"
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            placeholder="Ex.: Mesa 3"
            autoComplete="off"
            autoFocus
            className="h-12 flex-1 text-base"
            data-testid="team-name-input"
          />
          <Button
            type="submit"
            size="lg"
            disabled={busy || teamName.trim().length === 0}
            className="sm:w-40"
            data-testid="start-play"
          >
            {busy ? "Entrando…" : "Começar"}
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-nexus-muted">
          Anotem esse nome. Se a aba fechar ou o celular travar, é só digitá-lo de novo para voltar
          exatamente de onde vocês pararam.
        </p>
      </form>

      {resumedNotice ? (
        <div
          className="mt-6 rounded-sm border border-nexus-signal/40 bg-nexus-signal/10 px-4 py-3"
          role="status"
        >
          <p className="text-sm text-nexus-signal">
            Bem-vindos de volta — retomamos de onde vocês pararam.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-6 text-sm text-nexus-danger" role="alert">
          {error}
        </p>
      ) : null}

      {savedSession && !resumedNotice ? (
        <div className="mt-10 border-t border-nexus-border pt-5">
          <p className="text-xs text-nexus-muted">Esta é a última equipe que jogou neste aparelho.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => navigate("/play")}>
              Continuar como {savedSession.team_name}
            </Button>
            <Button variant="ghost" onClick={() => navigate(`/screen/${savedSession.game_id}`)}>
              Abrir o placar da sala
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function startFailureMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 422) {
    const body = err.body as { detail?: string } | null;
    if (body?.detail) return body.detail;
  }
  if (err instanceof ApiError && err.status === 0) {
    return "Não conseguimos falar com o servidor. Confira a conexão e tente de novo.";
  }
  return err instanceof Error && err.message
    ? err.message
    : "Não foi possível começar. Tente de novo.";
}
