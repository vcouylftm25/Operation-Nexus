import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { InvestigationResult } from "@/lib/types";

export interface ChatEntry {
  id: string;
  question: string;
  displayQuestion?: string;
  result?: InvestigationResult;
  error?: string;
}

interface ChatTranscriptProps {
  entries: ChatEntry[];
}

const THINKING_STEPS = ["Interpretando pergunta", "Consultando relações", "Recuperando evidências"];

/** Cosmetic-only: advances while the real request is in flight, settles the
 * moment the parent re-renders this entry with a result or error. Doesn't
 * fabricate any content, just narrates the wait. */
function ThinkingSteps() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 420);
    const t2 = setTimeout(() => setStep(2), 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 9 }}>
      {THINKING_STEPS.map((label, i) => (
        <div
          key={label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10.5,
            color: "var(--nx-muted)",
          }}
        >
          <span>{label}</span>
          <span style={{ color: i < step ? "var(--nx-accent)" : "var(--nx-muted)" }}>
            {i < step ? "✓" : i === step ? "···" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChatTranscript({ entries }: ChatTranscriptProps) {
  if (entries.length === 0) {
    return (
      <div style={{ padding: "26px 6px", color: "var(--nx-muted)" }}>
        <p
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "var(--nx-muted)",
          }}
        >
          POR ONDE COMEÇAR
        </p>
        <ol
          style={{
            marginTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            fontSize: 11.5,
            lineHeight: 1.55,
            listStyle: "none",
            padding: 0,
            counterReset: "nxStep",
          }}
        >
          {[
            "Clique numa pessoa do grafo para abrir o dossiê dela.",
            "Selecione duas e peça as conexões em comum.",
            "Ou pergunte com suas palavras no campo abaixo.",
          ].map((step, index) => (
            <li key={step} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <span
                style={{
                  flexShrink: 0,
                  width: 17,
                  height: 17,
                  borderRadius: "50%",
                  border: "1px solid var(--nx-line-2)",
                  display: "grid",
                  placeItems: "center",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9.5,
                  color: "var(--nx-accent-text)",
                }}
              >
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <ol style={{ display: "flex", flexDirection: "column", gap: 12, paddingRight: 8 }}>
        {entries.map((entry) => {
          const pending = !entry.result && !entry.error;
          return (
            <li key={entry.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  padding: "10px 12px",
                  border: "1px solid var(--nx-line)",
                  borderRadius: 12,
                  background: "var(--nx-card)",
                }}
              >
                <p
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9.5,
                    letterSpacing: "0.16em",
                    color: "var(--nx-muted)",
                  }}
                >
                  VOCÊ
                </p>
                <p style={{ marginTop: 5, fontSize: 12.5, color: "var(--nx-ink)" }}>
                  {entry.displayQuestion ?? entry.question}
                </p>
              </div>

              {entry.error ? (
                <div
                  style={{
                    padding: "10px 12px",
                    border: "1px solid rgb(198 40 40 / 0.4)",
                    borderRadius: 12,
                    background: "var(--nx-card)",
                    fontSize: 12.5,
                    color: "var(--nx-danger)",
                  }}
                >
                  {entry.error}
                </div>
              ) : null}

              {pending || entry.result ? (
                <div
                  style={{
                    padding: "13px 14px",
                    border: "1px solid var(--nx-accent-18)",
                    borderRadius: 16,
                    background: "var(--nx-elev)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 9.5,
                        letterSpacing: "0.16em",
                        color: "var(--nx-accent-text)",
                      }}
                    >
                      VERA
                    </span>
                    {entry.result ? (
                      <span
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 999,
                          border: "1px solid var(--nx-accent-30)",
                          color: "var(--nx-accent-text)",
                        }}
                      >
                        {entry.result.credits_charged} cr
                      </span>
                    ) : null}
                  </div>

                  {pending ? (
                    <ThinkingSteps />
                  ) : entry.result ? (
                    <>
                      <p
                        style={{
                          marginTop: 9,
                          fontSize: 12.5,
                          lineHeight: 1.6,
                          color: "var(--nx-ink)",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {entry.result.answer.answer}
                      </p>
                      {entry.result.answer.caveats.length > 0 ? (
                        <ul style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                          {entry.result.answer.caveats.map((caveat) => (
                            <li key={caveat} style={{ fontSize: 11, color: "var(--nx-muted)" }}>
                              ⚠ {caveat}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {entry.result.answer.discovered_node_ids.length > 0 ? (
                        <p
                          style={{
                            marginTop: 8,
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: 10,
                            color: "var(--nx-accent-text)",
                          }}
                        >
                          +{entry.result.answer.discovered_node_ids.length} nós · +
                          {entry.result.answer.discovered_relationship_ids.length} relações
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </ScrollArea>
  );
}
