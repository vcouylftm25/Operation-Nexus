import { useState, type FormEvent } from "react";
import { useGraphStore } from "@/features/graph/graphStore";
import { ChatTranscript } from "./ChatTranscript";
import { estimateCommandCost } from "./commands";
import { ToolPalette } from "./ToolPalette";
import type { InvestigatorSession } from "./useInvestigatorSession";

interface InvestigatorPanelProps {
  session: InvestigatorSession;
  credits?: number;
}

export function InvestigatorPanel({ session, credits }: InvestigatorPanelProps) {
  const selectedIds = useGraphStore((s) => s.selectedIds);
  const [question, setQuestion] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    session.submit(question);
    setQuestion("");
  }

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        background: "var(--nx-surface)",
        borderLeft: "1px solid var(--nx-line)",
      }}
    >
      <header style={{ padding: "15px 16px", borderBottom: "1px solid var(--nx-line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--nx-accent)",
              animation: "nxBreathe 2.6s ease-in-out infinite",
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", color: "var(--nx-ink)" }}>
            VERA
          </span>
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 9,
              letterSpacing: "0.12em",
              color: "var(--nx-accent-text)",
              border: "1px solid var(--nx-accent-45)",
              borderRadius: 999,
              padding: "2px 7px",
            }}
          >
            GRAPHRAG
          </span>
          {credits !== undefined ? (
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.1em",
                color: credits < 20 ? "var(--nx-danger)" : "var(--nx-muted)",
              }}
            >
              {credits} CR
            </span>
          ) : null}
        </div>
        <p style={{ fontSize: 11, color: "var(--nx-muted)", marginTop: 5, lineHeight: 1.5 }}>
          Analista de vínculos do caso. Pergunte em português: ela busca no grafo e nas
          evidências que sua equipe já descobriu — nunca no gabarito.
        </p>
      </header>

      <div style={{ flex: 1, minHeight: 0, padding: "12px 16px", overflow: "hidden" }}>
        <ChatTranscript entries={session.entries} />
      </div>

      <form
        onSubmit={onSubmit}
        style={{
          borderTop: "1px solid var(--nx-line)",
          padding: "12px 16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <ToolPalette disabled={session.pending} selectedIds={selectedIds} onPick={session.submit} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            border: "1px solid var(--nx-line-2)",
            borderRadius: 10,
            background: "var(--nx-card)",
          }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            // A free-form question never required a selected node — only the
            // quick actions above do. Keep this true regardless of theme.
            placeholder={
              selectedIds.length > 0
                ? "Pergunte ou use uma ação acima…"
                : "ex.: quem usa o mesmo aparelho?"
            }
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--nx-ink)",
              fontSize: 12,
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (question.trim()) {
                  session.submit(question);
                  setQuestion("");
                }
              }
            }}
          />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--nx-muted)" }}>
            {question.trim() ? `${estimateCommandCost(question)} cr` : ""}
          </span>
          <button
            type="submit"
            disabled={session.pending || question.trim().length === 0}
            data-testid="investigate-submit"
            style={{
              cursor: session.pending || !question.trim() ? "default" : "pointer",
              opacity: session.pending || !question.trim() ? 0.45 : 1,
              border: "none",
              background: "transparent",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              letterSpacing: "0.1em",
              color: "var(--nx-accent-text)",
            }}
          >
            {session.pending ? "CONSULTANDO…" : "INVESTIGAR"}
          </button>
        </div>
      </form>
    </section>
  );
}
