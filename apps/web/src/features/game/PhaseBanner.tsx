import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/Dialog";
import { phaseBrief } from "@/lib/mock/gameDesign";

interface PhaseBannerProps {
  phase: number;
  totalPhases: number;
  title: string | null;
  narrative: string | null;
  credits: number;
  /** False in the last phase, once the run is over, or after a 409 from the API. */
  canAdvance: boolean;
  advancing: boolean;
  onAdvance: () => void;
  blockedReason: string | null;
  /** Narrow screens open collapsed: the briefing would eat half the canvas. */
  briefingOpen?: boolean;
}

export function PhaseBanner({
  phase,
  totalPhases,
  title,
  narrative,
  credits,
  canAdvance,
  advancing,
  onAdvance,
  blockedReason,
  briefingOpen = true,
}: PhaseBannerProps) {
  const [expanded, setExpanded] = useState(briefingOpen);
  const [confirming, setConfirming] = useState(false);
  const brief = phaseBrief(phase);

  return (
    <section
      style={{
        padding: "12px 20px 14px",
        borderBottom: "1px solid var(--nx-line)",
        background: "var(--nx-card)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", gap: 3 }}>
                {Array.from({ length: totalPhases }, (_, index) => (
                  <span
                    key={index}
                    style={{
                      width: 16,
                      height: 3,
                      borderRadius: 2,
                      background:
                        index < phase ? "var(--nx-accent)" : "var(--nx-line-2)",
                    }}
                  />
                ))}
              </div>
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9.5,
                  letterSpacing: "0.18em",
                  color: "var(--nx-accent-text)",
                }}
              >
                FASE {phase} DE {totalPhases}
              </span>
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--nx-ink)" }}>
              {title ?? brief.eyebrow}
            </h2>
          </div>

          <p style={{ marginTop: 5, fontSize: 12.5, color: "var(--nx-muted)" }}>
            {brief.objective}
          </p>

          {narrative ? (
            <p
              style={{
                marginTop: 8,
                maxWidth: 900,
                fontSize: 12.5,
                lineHeight: 1.6,
                color: "var(--nx-muted)",
                display: expanded ? "block" : "-webkit-box",
                WebkitLineClamp: expanded ? undefined : 2,
                WebkitBoxOrient: "vertical",
                overflow: expanded ? undefined : "hidden",
              }}
            >
              {narrative}
            </p>
          ) : null}

          <div
            style={{
              marginTop: 9,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "5px 11px",
                borderRadius: 8,
                border: "1px solid var(--nx-line)",
                background: "var(--nx-surface)",
                fontSize: 11.5,
                color: "var(--nx-ink)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--nx-attention)",
                  flexShrink: 0,
                }}
              />
              {brief.rule}
            </span>
            {narrative ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  color: "var(--nx-accent-text)",
                }}
              >
                {expanded ? "RECOLHER BRIEFING" : "LER O BRIEFING"}
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <div
            style={{
              textAlign: "right",
              padding: "7px 14px",
              borderRadius: 10,
              border: "1px solid var(--nx-line)",
              background: "var(--nx-surface)",
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
              CRÉDITOS
            </p>
            <p
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 22,
                lineHeight: 1.15,
                color: credits < 20 ? "var(--nx-danger)" : "var(--nx-ink)",
              }}
            >
              {credits}
            </p>
          </div>

          {canAdvance ? (
            <button
              type="button"
              disabled={advancing}
              onClick={() => setConfirming(true)}
              data-testid="advance-phase"
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid var(--nx-accent)",
                background: "var(--nx-accent)",
                color: "var(--nx-on-accent)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: advancing ? "default" : "pointer",
                opacity: advancing ? 0.6 : 1,
              }}
            >
              {advancing ? "Avançando…" : "Avançar para a próxima fase"}
            </button>
          ) : (
            <p style={{ maxWidth: 210, fontSize: 11.5, lineHeight: 1.5, color: "var(--nx-muted)" }}>
              {blockedReason ?? "Vocês já estão na última fase."}
            </p>
          )}
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold text-nexus-text">
            Avançar para a fase {phase + 1}?
          </DialogTitle>
          <DialogDescription className="mt-3 text-sm leading-relaxed text-nexus-muted">
            Avançar é definitivo: não dá para voltar para a fase {phase}. A equipe recebe os
            créditos da nova fase e novas informações entram no caso — mas o tempo gasto conta, e
            quem avança sem ter lido o que já está na mesa costuma se perder.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Ainda não</Button>
            </DialogClose>
            <Button
              onClick={() => {
                setConfirming(false);
                onAdvance();
              }}
              data-testid="advance-phase-confirm"
            >
              Avançar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
