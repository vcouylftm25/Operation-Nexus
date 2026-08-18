import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { api } from "@/lib/client";
import { FRAUD_PATTERNS, type FraudPattern } from "@/lib/types";
import { useTeamGraphPayload } from "@/features/graph/graphStore";
import { cn } from "@/lib/utils";

interface HypothesisBoardProps { teamId: string; sessionToken: string; }

const PATTERN_LABEL: Record<FraudPattern, string> = {
  IDENTITY_RING: "Rede de identidades",
  MULE_ACCOUNTS: "Contas laranja",
  BROKER_COLLUSION: "Conluio de correspondentes",
  SYNTHETIC_IDENTITIES: "Identidades sintéticas",
  OTHER: "Outro mecanismo",
};

export function HypothesisBoard({ teamId, sessionToken }: HypothesisBoardProps) {
  const graph = useTeamGraphPayload();
  const people = useMemo(() => graph.nodes.filter((node) => node.labels.includes("Person")), [graph.nodes]);
  const evidence = useMemo(() => graph.nodes.filter((node) => node.labels.includes("Evidence") || node.labels.includes("Message")), [graph.nodes]);
  const [mode, setMode] = useState<"board" | "accuse">("board");
  const [notes, setNotes] = useState(() => localStorage.getItem(`nexus-notes-${teamId}`) ?? "");
  const [accused, setAccused] = useState<string[]>([]);
  const [coordinator, setCoordinator] = useState("");
  const [pattern, setPattern] = useState<FraudPattern>("MULE_ACCOUNTS");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [confidence, setConfidence] = useState(70);
  const [rationale, setRationale] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.submitAccusation(teamId, {
      accused_person_ids: accused,
      coordinator_person_id: coordinator,
      pattern,
      evidence_ids: evidenceIds,
      key_relationship_ids: graph.relationships.filter((rel) => accused.includes(rel.start_id) || accused.includes(rel.end_id)).slice(0, 5).map((rel) => rel.id),
      confidence,
      rationale: rationale.trim(),
    }, sessionToken),
    onSuccess: () => { setDone(true); setError(null); },
    onError: (err) => setError(err instanceof Error ? err.message : "Falha ao enviar acusação."),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!coordinator || accused.length === 0 || rationale.trim().length < 8) {
      setError("Selecione participantes, coordenador e explique sua teoria.");
      return;
    }
    mutation.mutate();
  }

  return <section className="flex h-full min-h-0 flex-col">
    <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
      <div><p className="font-mono text-[9px] uppercase tracking-[0.22em] text-nexus-muted">Investigation board</p><p className="mt-0.5 text-xs text-white/65">Construa a teoria antes de travar a acusação.</p></div>
      <div className="flex rounded-xl border border-white/[0.07] bg-white/[0.02] p-1"><button type="button" onClick={() => setMode("board")} className={cn("rounded-lg px-3 py-1.5 text-xs", mode === "board" ? "bg-white/8 text-white" : "text-nexus-muted")}>Hipótese</button><button type="button" onClick={() => setMode("accuse")} className={cn("rounded-lg px-3 py-1.5 text-xs", mode === "accuse" ? "bg-nexus-amber/12 text-nexus-amber" : "text-nexus-muted")}>Lock-in</button></div>
    </div>
    {mode === "board" ? <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px] gap-3 p-3"><Textarea className="h-full min-h-[110px] resize-none rounded-xl border-white/10 bg-white/[0.02]" value={notes} onChange={(event) => { setNotes(event.target.value); localStorage.setItem(`nexus-notes-${teamId}`, event.target.value); }} placeholder="O que sabemos? O que é só correlação? Qual relação ainda precisa ser explicada?" /><div className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-3"><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-nexus-muted">Entidades descobertas</p><div className="mt-3 flex max-h-[120px] flex-wrap gap-1.5 overflow-auto">{people.length === 0 ? <p className="text-xs text-nexus-muted">Nenhuma pessoa investigada ainda.</p> : people.map((person) => <span key={person.id} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/80">{person.label_display}</span>)}</div></div></div> : <div className="min-h-0 flex-1 overflow-auto p-3">{done ? <div className="flex h-full items-center justify-center text-center"><div><p className="text-sm font-medium text-nexus-signal">Acusação travada.</p><p className="mt-1 text-xs text-nexus-muted">O placar aparece quando o host encerrar a operação.</p></div></div> : <form onSubmit={onSubmit} className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr_1fr]">
      <ChoiceCard title="1 · Quem participou?"><div className="flex max-h-[118px] flex-wrap gap-1.5 overflow-auto">{people.map((person) => <button key={person.id} type="button" onClick={() => setAccused((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])} className={cn("rounded-full border px-2.5 py-1 text-[11px]", accused.includes(person.id) ? "border-nexus-danger/35 bg-nexus-danger/10 text-[#ffb3b3]" : "border-white/10 text-white/70")}>{person.label_display}</button>)}</div></ChoiceCard>
      <ChoiceCard title="2 · Quem coordenou?"><div className="flex max-h-[118px] flex-wrap gap-1.5 overflow-auto">{accused.map((id) => { const person = people.find((item) => item.id === id); return person ? <button key={id} type="button" onClick={() => setCoordinator(id)} className={cn("rounded-full border px-2.5 py-1 text-[11px]", coordinator === id ? "border-nexus-amber/45 bg-nexus-amber/10 text-nexus-amber" : "border-white/10 text-white/70")}>{person.label_display}</button> : null; })}</div></ChoiceCard>
      <ChoiceCard title="3 · Como funcionava?"><select className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-[#0b0f16] px-2 text-xs text-white" value={pattern} onChange={(event) => setPattern(event.target.value as FraudPattern)}>{FRAUD_PATTERNS.map((item) => <option key={item} value={item}>{PATTERN_LABEL[item]}</option>)}</select></ChoiceCard>
      <ChoiceCard title="4 · Prove com evidências" className="xl:col-span-2"><div className="flex max-h-[80px] flex-wrap gap-1.5 overflow-auto">{evidence.length === 0 ? <p className="text-xs text-nexus-muted">Nenhuma evidência material recuperada.</p> : evidence.map((item) => <button key={item.id} type="button" onClick={() => setEvidenceIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} className={cn("rounded-lg border px-2.5 py-1.5 text-left text-[11px]", evidenceIds.includes(item.id) ? "border-nexus-signal/35 bg-nexus-signal/8 text-nexus-signal" : "border-white/10 text-white/70")}>{item.label_display}</button>)}</div></ChoiceCard>
      <ChoiceCard title={`Confiança · ${confidence}%`}><input type="range" min={0} max={100} value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} className="mt-3 w-full accent-nexus-amber" /></ChoiceCard>
      <div className="flex items-end gap-3 xl:col-span-3"><Textarea className="min-h-[68px] flex-1 rounded-xl border-white/10 bg-white/[0.02]" value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Explique a cadeia: quem fez o quê, por qual relação e com qual evidência." /><Button type="submit" variant="danger" disabled={mutation.isPending}>{mutation.isPending ? "Travando…" : "Travar acusação"}</Button></div>
      {error ? <p className="text-xs text-nexus-danger xl:col-span-3">{error}</p> : null}
    </form>}</div>}
  </section>;
}

function ChoiceCard({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl border border-white/[0.07] bg-white/[0.018] p-3", className)}><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-nexus-muted">{title}</p>{children}</div>;
}
