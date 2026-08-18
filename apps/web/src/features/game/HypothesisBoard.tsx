import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/client";
import { FRAUD_PATTERNS, type FraudPattern } from "@/lib/types";
import { useTeamGraphPayload } from "@/features/graph/graphStore";

interface HypothesisBoardProps { teamId: string; sessionToken: string; }

const PATTERN_LABEL: Record<FraudPattern, string> = {
  IDENTITY_RING: "Rede de identidades",
  MULE_ACCOUNTS: "Contas laranja",
  BROKER_COLLUSION: "Conluio de correspondentes",
  SYNTHETIC_IDENTITIES: "Identidades sintéticas",
  OTHER: "Outro mecanismo",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--nx-line-2)",
  borderRadius: 12,
  background: "var(--nx-card)",
  color: "var(--nx-ink)",
  padding: 11,
  fontSize: 12,
  lineHeight: 1.5,
  outline: "none",
  resize: "none",
  fontFamily: "inherit",
};

const chipStyle = (active: boolean, activeColor: string): CSSProperties => ({
  borderRadius: 999,
  border: `1px solid ${active ? activeColor : "var(--nx-line-2)"}`,
  background: active ? "var(--nx-accent-08)" : "transparent",
  color: active ? activeColor : "var(--nx-ink)",
  padding: "5px 11px",
  fontSize: 11.5,
  cursor: "pointer",
});

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

  return (
    <section style={{ display: "flex", height: "100%", minHeight: 0, flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--nx-line)", padding: "9px 16px" }}>
        <div>
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: "var(--nx-muted)", textTransform: "uppercase" }}>
            Investigation board
          </p>
          <p style={{ marginTop: 2, fontSize: 12, color: "var(--nx-muted)" }}>Construa a teoria antes de travar a acusação.</p>
        </div>
        <div style={{ display: "flex", borderRadius: 10, border: "1px solid var(--nx-line)", background: "var(--nx-elev)", padding: 3 }}>
          <button
            type="button"
            onClick={() => setMode("board")}
            style={{ borderRadius: 7, padding: "6px 12px", fontSize: 12, border: "none", cursor: "pointer", background: mode === "board" ? "var(--nx-card)" : "transparent", color: mode === "board" ? "var(--nx-ink)" : "var(--nx-muted)" }}
          >
            Hipótese
          </button>
          <button
            type="button"
            onClick={() => setMode("accuse")}
            style={{ borderRadius: 7, padding: "6px 12px", fontSize: 12, border: "none", cursor: "pointer", background: mode === "accuse" ? "var(--nx-accent-text)" : "transparent", color: mode === "accuse" ? "var(--nx-on-accent)" : "var(--nx-muted)" }}
          >
            Lock-in
          </button>
        </div>
      </div>
      {mode === "board" ? (
        <div style={{ display: "grid", minHeight: 0, flex: 1, gridTemplateColumns: "1fr 320px", gap: 12, padding: 12 }}>
          <textarea
            style={{ ...textareaStyle, height: "100%", minHeight: 110 }}
            value={notes}
            onChange={(event) => { setNotes(event.target.value); localStorage.setItem(`nexus-notes-${teamId}`, event.target.value); }}
            placeholder="O que sabemos? O que é só correlação? Qual relação ainda precisa ser explicada?"
          />
          <div style={{ borderRadius: 12, border: "1px solid var(--nx-line)", background: "var(--nx-elev)", padding: 12 }}>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: "var(--nx-muted)", textTransform: "uppercase" }}>
              Entidades descobertas
            </p>
            <div style={{ marginTop: 10, display: "flex", maxHeight: 120, flexWrap: "wrap", gap: 6, overflow: "auto" }}>
              {people.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--nx-muted)" }}>Nenhuma pessoa investigada ainda.</p>
              ) : (
                people.map((person) => (
                  <span key={person.id} style={{ borderRadius: 999, border: "1px solid var(--nx-line-2)", background: "var(--nx-card)", padding: "5px 10px", fontSize: 11, color: "var(--nx-ink)" }}>
                    {person.label_display}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ minHeight: 0, flex: 1, overflow: "auto", padding: 12 }}>
          {done ? (
            <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--nx-explained)" }}>Acusação travada.</p>
                <p style={{ marginTop: 4, fontSize: 12, color: "var(--nx-muted)" }}>O placar aparece quando o host encerrar a operação.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, gridTemplateColumns: "1.1fr 0.9fr 1fr" }}>
              <ChoiceCard title="1 · Quem participou?">
                <div style={{ display: "flex", maxHeight: 118, flexWrap: "wrap", gap: 6, overflow: "auto" }}>
                  {people.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => setAccused((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])}
                      style={chipStyle(accused.includes(person.id), "var(--nx-danger)")}
                    >
                      {person.label_display}
                    </button>
                  ))}
                </div>
              </ChoiceCard>
              <ChoiceCard title="2 · Quem coordenou?">
                <div style={{ display: "flex", maxHeight: 118, flexWrap: "wrap", gap: 6, overflow: "auto" }}>
                  {accused.map((id) => {
                    const person = people.find((item) => item.id === id);
                    return person ? (
                      <button key={id} type="button" onClick={() => setCoordinator(id)} style={chipStyle(coordinator === id, "var(--nx-accent-text)")}>
                        {person.label_display}
                      </button>
                    ) : null;
                  })}
                </div>
              </ChoiceCard>
              <ChoiceCard title="3 · Como funcionava?">
                <select
                  style={{ marginTop: 8, height: 36, width: "100%", borderRadius: 9, border: "1px solid var(--nx-line-2)", background: "var(--nx-card)", padding: "0 8px", fontSize: 12, color: "var(--nx-ink)" }}
                  value={pattern}
                  onChange={(event) => setPattern(event.target.value as FraudPattern)}
                >
                  {FRAUD_PATTERNS.map((item) => <option key={item} value={item}>{PATTERN_LABEL[item]}</option>)}
                </select>
              </ChoiceCard>
              <ChoiceCard title="4 · Prove com evidências" style={{ gridColumn: "span 2" }}>
                <div style={{ display: "flex", maxHeight: 80, flexWrap: "wrap", gap: 6, overflow: "auto" }}>
                  {evidence.length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--nx-muted)" }}>Nenhuma evidência material recuperada.</p>
                  ) : (
                    evidence.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setEvidenceIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}
                        style={{ ...chipStyle(evidenceIds.includes(item.id), "var(--nx-explained)"), borderRadius: 9, textAlign: "left" }}
                      >
                        {item.label_display}
                      </button>
                    ))
                  )}
                </div>
              </ChoiceCard>
              <ChoiceCard title={`Confiança · ${confidence}%`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={confidence}
                  onChange={(event) => setConfidence(Number(event.target.value))}
                  style={{ marginTop: 12, width: "100%", accentColor: "var(--nx-accent)" }}
                />
              </ChoiceCard>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, gridColumn: "span 3" }}>
                <textarea
                  style={{ ...textareaStyle, flex: 1, minHeight: 68 }}
                  value={rationale}
                  onChange={(event) => setRationale(event.target.value)}
                  placeholder="Explique a cadeia: quem fez o quê, por qual relação e com qual evidência."
                />
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 10,
                    border: "1px solid var(--nx-danger)",
                    background: "var(--nx-danger)",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    cursor: mutation.isPending ? "default" : "pointer",
                    opacity: mutation.isPending ? 0.6 : 1,
                    flexShrink: 0,
                  }}
                >
                  {mutation.isPending ? "Travando…" : "Travar acusação"}
                </button>
              </div>
              {error ? <p style={{ fontSize: 12, color: "var(--nx-danger)", gridColumn: "span 3" }}>{error}</p> : null}
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function ChoiceCard({ title, style, children }: { title: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--nx-line)", background: "var(--nx-elev)", padding: 12, ...style }}>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: "var(--nx-muted)", textTransform: "uppercase" }}>
        {title}
      </p>
      {children}
    </div>
  );
}
