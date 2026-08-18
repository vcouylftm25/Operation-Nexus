/**
 * The /teams/{id}/investigate flow — chat entries, credit spend confirmation,
 * and the real `api.investigate` mutation. Extracted out of InvestigatorPanel
 * so the graph canvas's multi-select quick actions ("conexões em comum",
 * "encontrar caminho") can feed the exact same backend call and the exact
 * same NEXUS AI feed, instead of duplicating the mutation.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, isInsufficientCredits } from "@/lib/client";
import type { TeamState } from "@/lib/types";
import { useGraphStore } from "@/features/graph/graphStore";
import type { ChatEntry } from "./ChatTranscript";
import { estimateCommandCost } from "./commands";

const EXPENSIVE_COST = 15;

export interface InvestigatorSession {
  entries: ChatEntry[];
  pending: boolean;
  submit: (raw: string) => void;
}

export function useInvestigatorSession(teamId: string, sessionToken: string): InvestigatorSession {
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<ChatEntry[]>([]);

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

  function submit(raw: string) {
    const q = raw.trim();
    if (!q || mutation.isPending) return;
    const cost = estimateCommandCost(q);
    if (cost >= EXPENSIVE_COST) {
      const ok = window.confirm(`Isso custa ${cost} cr. Confirma a investigação?`);
      if (!ok) return;
    }
    const id = crypto.randomUUID();
    setEntries((prev) => [...prev, { id, question: q, displayQuestion: humanizeQuestion(q) }]);
    mutation.mutate({ id, question: q });
  }

  return { entries, pending: mutation.isPending, submit };
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
