import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { api } from "@/lib/client";
import { FRAUD_PATTERNS, type FraudPattern } from "@/lib/types";
import { useGraphStore, useTeamGraphPayload } from "@/features/graph/graphStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

interface HypothesisBoardProps {
  teamId: string;
  sessionToken: string;
}

const PATTERN_LABEL: Record<FraudPattern, string> = {
  IDENTITY_RING: "Anel de identidades",
  MULE_ACCOUNTS: "Contas laranja",
  BROKER_COLLUSION: "Conluio de correspondentes",
  SYNTHETIC_IDENTITIES: "Identidades sintéticas",
  OTHER: "Outro",
};

export function HypothesisBoard({ teamId, sessionToken }: HypothesisBoardProps) {
  const graph = useTeamGraphPayload();
  const people = graph.nodes.filter((n) => n.labels.includes("Person"));
  const [notes, setNotes] = useState(() => localStorage.getItem(`nexus-notes-${teamId}`) ?? "");
  const [accused, setAccused] = useState("");
  const [coordinator, setCoordinator] = useState("");
  const [pattern, setPattern] = useState<FraudPattern>("MULE_ACCOUNTS");
  const [evidenceIds, setEvidenceIds] = useState("");
  const [relIds, setRelIds] = useState("");
  const [confidence, setConfidence] = useState(70);
  const [rationale, setRationale] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.submitAccusation(
        teamId,
        {
          accused_person_ids: splitIds(accused),
          coordinator_person_id: coordinator.trim(),
          pattern,
          evidence_ids: splitIds(evidenceIds),
          key_relationship_ids: splitIds(relIds),
          confidence,
          rationale: rationale.trim(),
        },
        sessionToken,
      ),
    onSuccess: () => {
      setDone(true);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Falha ao enviar acusação.");
    },
  });

  function onNotes(value: string) {
    setNotes(value);
    localStorage.setItem(`nexus-notes-${teamId}`, value);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!coordinator.trim() || splitIds(accused).length === 0 || rationale.trim().length < 8) {
      setError("Informe acusados, coordenador e uma justificativa.");
      return;
    }
    mutation.mutate();
  }

  return (
    <section className="nexus-panel flex h-full min-h-0 flex-col rounded-none border-x-0 border-b-0">
      <Tabs defaultValue="hypothesis" className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-nexus-muted">
            Hypothesis board / acusação
          </p>
          <TabsList>
            <TabsTrigger value="hypothesis">Notas</TabsTrigger>
            <TabsTrigger value="accuse">Acusação</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="hypothesis" className="min-h-0 flex-1">
          <Textarea
            className="h-[140px]"
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
            placeholder="Hipóteses locais — nunca saem deste browser, nunca vão para o projetor."
          />
          {people.length > 0 ? (
            <p className="mt-2 font-mono text-[10px] text-nexus-muted">
              Pessoas no grafo:{" "}
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="mr-2 text-nexus-amber hover:underline"
                  onClick={() => useGraphStore.getState().select(p.id)}
                >
                  {p.label_display} ({p.id})
                </button>
              ))}
            </p>
          ) : null}
        </TabsContent>
        <TabsContent value="accuse" className="min-h-0 flex-1 overflow-auto">
          {done ? (
            <p className="py-6 text-center text-sm text-nexus-signal">
              Acusação enviada. O host libera o placar ao finalizar o jogo.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <label className="col-span-2 text-xs text-nexus-muted">
                Acusados (person_id, separados por vírgula)
                <Input
                  className="mt-1 font-mono"
                  value={accused}
                  onChange={(e) => setAccused(e.target.value)}
                  placeholder="person_01,person_02"
                />
              </label>
              <label className="text-xs text-nexus-muted">
                Coordenador
                <Input
                  className="mt-1 font-mono"
                  value={coordinator}
                  onChange={(e) => setCoordinator(e.target.value)}
                  placeholder="person_01"
                />
              </label>
              <label className="text-xs text-nexus-muted">
                Padrão
                <select
                  className="mt-1 h-10 w-full rounded-sm border border-nexus-border bg-nexus-bg/70 px-2 text-sm text-nexus-text"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value as FraudPattern)}
                >
                  {FRAUD_PATTERNS.map((p) => (
                    <option key={p} value={p}>
                      {PATTERN_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-nexus-muted">
                Evidências
                <Input
                  className="mt-1 font-mono"
                  value={evidenceIds}
                  onChange={(e) => setEvidenceIds(e.target.value)}
                  placeholder="evidence_01,message_01"
                />
              </label>
              <label className="text-xs text-nexus-muted">
                Relações-chave
                <Input
                  className="mt-1 font-mono"
                  value={relIds}
                  onChange={(e) => setRelIds(e.target.value)}
                  placeholder="rel_005,rel_009"
                />
              </label>
              <label className="text-xs text-nexus-muted">
                Confiança ({confidence})
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={confidence}
                  onChange={(e) => setConfidence(Number(e.target.value))}
                  className="mt-3 w-full accent-nexus-amber"
                />
              </label>
              <label className="col-span-2 lg:col-span-3 text-xs text-nexus-muted">
                Justificativa
                <Textarea
                  className="mt-1 min-h-[64px]"
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Por que estes são os responsáveis, com base no grafo visível."
                />
              </label>
              <div className="flex items-end justify-end">
                <Button type="submit" variant="danger" disabled={mutation.isPending}>
                  {mutation.isPending ? "Enviando…" : "Acusar"}
                </Button>
              </div>
              {error ? <p className="col-span-full text-xs text-nexus-danger">{error}</p> : null}
            </form>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function splitIds(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
