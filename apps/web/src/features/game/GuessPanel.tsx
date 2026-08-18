import { useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client";
import { MAX_GUESS_ATTEMPTS, type GuessResult, type TeamStatus } from "@/lib/types";
import { formatClock } from "@/lib/utils";

interface GuessPanelProps {
  teamId: string;
  sessionToken: string;
  currentPhase: number;
  finalPhase: number;
  status: TeamStatus;
  attemptsUsed: number;
  startedAt: string | null;
  solvedAt: string | null;
}

const shellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "12px 16px 14px",
};

const labelStyle: CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 9.5,
  letterSpacing: "0.18em",
  color: "var(--nx-muted)",
  textTransform: "uppercase",
};

export function GuessPanel({
  teamId,
  sessionToken,
  currentPhase,
  finalPhase,
  status,
  attemptsUsed,
  startedAt,
  solvedAt,
}: GuessPanelProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<GuessResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Naming a suspect is the only irreversible move in the game, so it stays
  // shut until the last phase: three tries over the suspect list would beat
  // investigating if a team could guess on the first screen it sees.
  const unlocked = currentPhase >= finalPhase;
  const resolved = status !== "PLAYING";

  const suspectsQuery = useQuery({
    queryKey: ["suspects", teamId],
    queryFn: () => api.getSuspects(teamId, sessionToken),
    enabled: unlocked && !resolved,
  });

  const guess = useMutation({
    mutationFn: (personId: string) => api.submitGuess(teamId, personId, sessionToken),
    onSuccess: (result) => {
      setOutcome(result);
      setSelected(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["suspects", teamId] });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a acusação.");
    },
  });

  const attemptsLeft = Math.max(0, MAX_GUESS_ATTEMPTS - attemptsUsed);
  const solved = status === "SOLVED";

  if (solved) {
    const elapsed =
      outcome?.elapsed_seconds ??
      (startedAt && solvedAt
        ? Math.max(0, Math.round((Date.parse(solvedAt) - Date.parse(startedAt)) / 1000))
        : null);
    return (
      <section style={shellStyle} data-testid="guess-panel">
        <p style={labelStyle}>Caso encerrado</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 20, flexWrap: "wrap" }}>
          <p style={{ fontSize: 20, fontWeight: 600, color: "var(--nx-explained)" }}>
            Vocês acertaram quem coordenou o esquema.
          </p>
          {outcome ? (
            <p
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 16,
                color: "var(--nx-ink)",
              }}
            >
              {outcome.score} pontos
            </p>
          ) : null}
          {elapsed !== null ? (
            <p
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 16,
                color: "var(--nx-muted)",
              }}
            >
              {formatClock(elapsed)} de investigação
            </p>
          ) : null}
        </div>
        <p style={{ fontSize: 12, color: "var(--nx-muted)" }}>
          O grafo continua aberto: vale a pena reconstruir a cadeia inteira enquanto as outras
          equipes terminam.
        </p>
      </section>
    );
  }

  if (status === "FAILED") {
    return (
      <section style={shellStyle} data-testid="guess-panel">
        <p style={labelStyle}>Caso encerrado</p>
        <p style={{ fontSize: 16, fontWeight: 600, color: "var(--nx-danger)" }}>
          As três tentativas acabaram.
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--nx-muted)" }}>
          A investigação de vocês está registrada e o caso segue em aberto para a equipe. Deixem o
          grafo montado: na revisão final vale comparar a rede que vocês construíram com a resposta.
        </p>
      </section>
    );
  }

  if (!unlocked) {
    return (
      <section style={shellStyle} data-testid="guess-panel">
        <p style={labelStyle}>Acusação</p>
        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--nx-ink)" }}>
          Vocês precisam chegar à fase {finalPhase} para acusar.
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--nx-muted)" }}>
          Não é uma trava por tempo: as mensagens e o caminho do dinheiro, que são o que separa
          quem executou de quem mandou, só entram no caso na última fase. Vocês estão na fase{" "}
          {currentPhase}.
        </p>
      </section>
    );
  }

  const suspects = suspectsQuery.data ?? [];
  const chosen = suspects.find((suspect) => suspect.id === selected) ?? null;

  return (
    <section style={shellStyle} data-testid="guess-panel">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <p style={labelStyle}>Acusação</p>
          <p style={{ marginTop: 3, fontSize: 12, color: "var(--nx-muted)" }}>
            Quem coordenou o esquema? Uma pessoa por tentativa.
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={labelStyle}>Tentativas restantes</p>
          <p
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 22,
              lineHeight: 1.15,
              color: attemptsLeft === 1 ? "var(--nx-danger)" : "var(--nx-ink)",
            }}
            data-testid="attempts-remaining"
          >
            {attemptsLeft} de {MAX_GUESS_ATTEMPTS}
          </p>
        </div>
      </div>

      {outcome && !outcome.correct ? (
        <p style={{ fontSize: 12.5, color: "var(--nx-danger)" }}>
          Não é essa pessoa. Restam {outcome.attempts_remaining}{" "}
          {outcome.attempts_remaining === 1 ? "tentativa" : "tentativas"} — use o que sobrou de
          crédito para testar a hipótese antes da próxima.
        </p>
      ) : null}
      {error ? <p style={{ fontSize: 12.5, color: "var(--nx-danger)" }}>{error}</p> : null}

      {suspectsQuery.isPending ? (
        <p style={{ fontSize: 12, color: "var(--nx-muted)" }}>Carregando suspeitos…</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {suspects.map((suspect) => {
            const active = selected === suspect.id;
            return (
              <button
                key={suspect.id}
                type="button"
                disabled={suspect.already_guessed || guess.isPending}
                onClick={() => setSelected(active ? null : suspect.id)}
                style={{
                  borderRadius: 999,
                  border: `1px solid ${active ? "var(--nx-danger)" : "var(--nx-line-2)"}`,
                  background: active ? "var(--nx-accent-08)" : "var(--nx-card)",
                  color: suspect.already_guessed ? "var(--nx-muted)" : "var(--nx-ink)",
                  padding: "7px 13px",
                  fontSize: 12,
                  cursor: suspect.already_guessed ? "default" : "pointer",
                  textDecoration: suspect.already_guessed ? "line-through" : "none",
                  opacity: suspect.already_guessed ? 0.55 : 1,
                }}
              >
                {suspect.name}
              </button>
            );
          })}
        </div>
      )}

      {chosen ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            borderRadius: 12,
            border: "1px solid var(--nx-danger)",
            background: "var(--nx-card)",
            padding: "10px 13px",
          }}
        >
          <p style={{ fontSize: 12.5, color: "var(--nx-ink)" }}>
            Acusar <strong>{chosen.name}</strong> de coordenar o esquema? Isso gasta uma das{" "}
            {attemptsLeft} tentativas restantes.
          </p>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{
                padding: "8px 12px",
                borderRadius: 9,
                border: "1px solid var(--nx-line-2)",
                background: "transparent",
                cursor: "pointer",
                fontSize: 12,
                color: "var(--nx-muted)",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={guess.isPending}
              onClick={() => guess.mutate(chosen.id)}
              data-testid="confirm-guess"
              style={{
                padding: "8px 14px",
                borderRadius: 9,
                border: "1px solid var(--nx-danger)",
                background: "var(--nx-danger)",
                color: "#fff",
                cursor: guess.isPending ? "default" : "pointer",
                opacity: guess.isPending ? 0.6 : 1,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {guess.isPending ? "Enviando…" : "Confirmar acusação"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
