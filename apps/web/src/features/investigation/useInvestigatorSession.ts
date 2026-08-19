/**
 * The /teams/{id}/investigate flow — chat entries, credit spend confirmation,
 * and the real `api.investigate` mutation. Extracted out of InvestigatorPanel
 * so the graph canvas's multi-select quick actions ("conexões em comum",
 * "encontrar caminho") can feed the exact same backend call and the exact
 * same feed from Vera, instead of duplicating the mutation.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, isInsufficientCredits } from "@/lib/client";
import type { TeamState } from "@/lib/types";
import { useGraphStore } from "@/features/graph/graphStore";
import type { ChatEntry } from "./ChatTranscript";
import { estimateCommandCost } from "./commands";

const EXPENSIVE_COST = 15;

/** A spend waiting on the player's yes — see `ConfirmSpendDialog`. */
export interface PendingSpend {
  question: string;
  label: string;
  cost: number;
}

export interface InvestigatorSession {
  entries: ChatEntry[];
  pending: boolean;
  submit: (raw: string) => void;
  awaitingConfirmation: PendingSpend | null;
  confirmSpend: () => void;
  cancelSpend: () => void;
}

export function useInvestigatorSession(teamId: string, sessionToken: string): InvestigatorSession {
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<PendingSpend | null>(null);

  const mutation = useMutation({
    mutationFn: ({ question }: { id: string; question: string }) =>
      api.investigate(teamId, question, sessionToken),
    onSuccess: (result, vars) => {
      useGraphStore.getState().merge(result.subgraph);
      queryClient.setQueryData<TeamState>(["team", teamId], (old) =>
        old ? { ...old, credits_balance: result.credits_remaining } : old,
      );
      setEntries((prev) => prev.map((entry) => (entry.id === vars.id ? { ...entry, result } : entry)));
    },
    onError: (err, vars) => {
      const message = isInsufficientCredits(err)
        ? `Créditos insuficientes — precisa ${err.body.required}, disponível ${err.body.available}.`
        : err instanceof Error
          ? err.message
          : "Falha na investigação.";
      setEntries((prev) => prev.map((entry) => (entry.id === vars.id ? { ...entry, error: message } : entry)));
    },
  });

  function dispatch(question: string) {
    const id = crypto.randomUUID();
    setEntries((prev) => [...prev, { id, question, displayQuestion: humanizeQuestion(question) }]);
    mutation.mutate({ id, question });
  }

  function submit(raw: string) {
    const q = raw.trim();
    if (!q || mutation.isPending || awaitingConfirmation) return;
    const cost = estimateCommandCost(q);
    if (cost >= EXPENSIVE_COST) {
      setAwaitingConfirmation({ question: q, label: humanizeQuestion(q), cost });
      return;
    }
    dispatch(q);
  }

  function confirmSpend() {
    if (!awaitingConfirmation) return;
    const { question } = awaitingConfirmation;
    setAwaitingConfirmation(null);
    dispatch(question);
  }

  return {
    entries,
    pending: mutation.isPending,
    submit,
    awaitingConfirmation,
    confirmSpend,
    cancelSpend: () => setAwaitingConfirmation(null),
  };
}

function humanizeQuestion(question: string): string {
  if (question.startsWith("/expand")) return "Expandir a rede ao redor do alvo";
  if (question.startsWith("/timeline")) return "Ver a linha do tempo do alvo";
  if (question.startsWith("/shared")) return "Procurar conexões compartilhadas";
  if (question.startsWith("/path")) return "Encontrar caminho entre as entidades selecionadas";
  if (question.startsWith("/inspect")) return "Inspecionar a entidade selecionada";
  if (question.startsWith("/search")) return "Buscar evidências";
  if (question.startsWith("/challenge")) return "Desafiar a explicação desta conexão";
  return question;
}
