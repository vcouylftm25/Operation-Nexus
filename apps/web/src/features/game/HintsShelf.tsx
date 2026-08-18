import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { api, isInsufficientCredits } from "@/lib/client";
import type { BuyHintResponse, HintCard, TeamState } from "@/lib/types";

interface HintsShelfProps {
  teamId: string;
  sessionToken: string;
}

export function HintsShelf({ teamId, sessionToken }: HintsShelfProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const hintsQuery = useQuery({
    queryKey: ["hints", teamId],
    queryFn: () => api.getHints(teamId, sessionToken),
  });

  const buy = useMutation({
    mutationFn: (hintId: string) => api.buyHint(teamId, hintId, sessionToken),
    onSuccess: (result: BuyHintResponse) => {
      setError(null);
      queryClient.setQueryData<HintCard[]>(["hints", teamId], (old) =>
        old?.map((card) => (card.id === result.hint.id ? result.hint : card)),
      );
      queryClient.setQueryData<TeamState>(["team", teamId], (old) =>
        old ? { ...old, credits_balance: result.credits_balance } : old,
      );
    },
    onError: (err: unknown) => {
      setError(
        isInsufficientCredits(err)
          ? `Créditos insuficientes: a dica custa ${err.body.required} e vocês têm ${err.body.available}.`
          : err instanceof Error
            ? err.message
            : "Não foi possível revelar a dica.",
      );
    },
  });

  const cards = hintsQuery.data ?? [];
  const phases = [...new Set(cards.map((card) => card.round))].sort((a, b) => a - b);

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--nx-muted)" }}>
          Dicas ensinam o próximo passo da investigação — nenhuma delas entrega o culpado. Além dos
          créditos, cada dica comprada desconta pontos no placar final.
        </p>

        {error ? <p style={{ fontSize: 12, color: "var(--nx-danger)" }}>{error}</p> : null}

        {hintsQuery.isPending ? (
          <p style={{ fontSize: 12, color: "var(--nx-muted)" }}>Carregando dicas…</p>
        ) : null}

        {!hintsQuery.isPending && cards.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--nx-muted)" }}>
            Nenhuma dica disponível nesta fase.
          </p>
        ) : null}

        {phases.map((phase) => (
          <div key={phase}>
            <p
              style={{
                marginBottom: 8,
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.16em",
                color: "var(--nx-muted)",
                textTransform: "uppercase",
              }}
            >
              Fase {phase}
            </p>
            <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cards
                .filter((card) => card.round === phase)
                .map((card) => (
                  <li
                    key={card.id}
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${card.purchased ? "var(--nx-accent-30)" : "var(--nx-line)"}`,
                      background: card.purchased ? "var(--nx-accent-06)" : "var(--nx-card)",
                      padding: "11px 13px",
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--nx-ink)" }}>
                      {card.title}
                    </p>
                    {card.purchased ? (
                      <p
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          lineHeight: 1.6,
                          color: "var(--nx-ink)",
                        }}
                      >
                        {card.text}
                      </p>
                    ) : (
                      <button
                        type="button"
                        disabled={buy.isPending}
                        onClick={() => buy.mutate(card.id)}
                        style={{
                          marginTop: 9,
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: 9,
                          border: "1px solid var(--nx-accent-35)",
                          background: "transparent",
                          cursor: buy.isPending ? "default" : "pointer",
                          opacity: buy.isPending ? 0.6 : 1,
                          fontSize: 11.5,
                          color: "var(--nx-accent-text)",
                        }}
                      >
                        Revelar por {card.cost} créditos
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
