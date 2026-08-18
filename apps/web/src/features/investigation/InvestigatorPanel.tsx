import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { api, isInsufficientCredits } from "@/lib/client";
import type { TeamState } from "@/lib/types";
import { useGraphStore } from "@/features/graph/graphStore";
import { ChatTranscript, type ChatEntry } from "./ChatTranscript";
import { estimateCommandCost } from "./commands";
import { ToolPalette } from "./ToolPalette";

interface InvestigatorPanelProps {
  teamId: string;
  sessionToken: string;
  credits?: number;
}

const EXPENSIVE_COST = 15;

export function InvestigatorPanel({ teamId, sessionToken, credits }: InvestigatorPanelProps) {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);

  const mutation = useMutation({
    mutationFn: ({ question: q }: { id: string; question: string }) =>
      api.investigate(teamId, q, sessionToken),
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
    setEntries((prev) => [...prev, { id, question: q }]);
    setQuestion("");
    mutation.mutate({ id, question: q });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit(question);
  }

  return (
    <section className="nexus-panel flex h-full min-h-0 flex-col rounded-none border-y-0 border-r-0">
      <header className="border-b border-nexus-border px-4 py-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-nexus-muted">Investigador</p>
        <p className="mt-1 text-[11px] leading-relaxed text-nexus-muted">
          Eu vejo o mesmo grafo que vocês. Sem gabarito. Cada ferramenta gasta o orçamento da equipe
          {credits !== undefined ? ` · ${credits} cr restantes` : ""}.
        </p>
      </header>
      <div className="min-h-0 flex-1 px-4 py-3">
        <ChatTranscript entries={entries} />
      </div>
      <form onSubmit={onSubmit} className="border-t border-nexus-border p-3 space-y-2">
        <ToolPalette disabled={mutation.isPending} onPick={setQuestion} />
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Pergunte em português, ou use a paleta…"
          rows={3}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(question);
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] text-nexus-muted">
            {question.trim() ? `${estimateCommandCost(question)} cr` : "Shift+Enter para quebra de linha"}
          </p>
          <Button
            type="submit"
            disabled={mutation.isPending || question.trim().length === 0}
            data-testid="investigate-submit"
          >
            {mutation.isPending ? "Consultando o grafo…" : "Investigar"}
          </Button>
        </div>
      </form>
    </section>
  );
}
