import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import type { ConnectionStatus } from "@/lib/ws";
import { cn } from "@/lib/utils";

interface NexusHeaderProps {
  subtitle?: string;
  credits?: number | null;
  round?: number | null;
  live?: ConnectionStatus;
  right?: ReactNode;
  /** "nx" renders the Nexus Graph Workspace v2 look (needs an `.nx-scope` ancestor). */
  variant?: "amber" | "nx";
}

export function NexusHeader({ subtitle, credits, round, live, right, variant = "amber" }: NexusHeaderProps) {
  const liveTone =
    live === "open" ? "live" : live === "reconnecting" || live === "connecting" ? "amber" : "danger";
  const liveLabel =
    live === "open" ? "LIVE" : live === "reconnecting" ? "RECONECTANDO" : live === "connecting" ? "SINCRONIZANDO" : "OFFLINE";

  if (variant === "nx") {
    return (
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 18,
          height: 54,
          padding: "0 20px",
          borderBottom: "1px solid var(--nx-line)",
          background: "var(--nx-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--nx-accent)", boxShadow: "0 0 12px var(--nx-accent-45)" }} />
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.2em", color: "var(--nx-ink)" }}>NEXUS</span>
          </div>
          {subtitle ? (
            <>
              <div style={{ width: 1, height: 18, background: "var(--nx-line-2)" }} />
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: "var(--nx-muted)" }}>
                {subtitle.toUpperCase()}
              </span>
            </>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {round !== null && round !== undefined ? (
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.16em", color: "var(--nx-muted)" }}>
              ROUND {String(round).padStart(2, "0")}
            </span>
          ) : null}
          {live ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: liveTone === "live" ? "var(--nx-accent-text)" : liveTone === "danger" ? "var(--nx-danger)" : "var(--nx-attention)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
              {liveLabel}
            </span>
          ) : null}
          {credits !== null && credits !== undefined ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 500, color: credits < 20 ? "var(--nx-danger)" : "var(--nx-ink)" }}>
                {credits}
              </span>
              <span style={{ fontSize: 10, letterSpacing: "0.16em", color: "var(--nx-muted)" }}>INTEL</span>
            </div>
          ) : null}
          {right}
        </div>
      </header>
    );
  }

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-nexus-border bg-[#07080c]/90 px-5 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="font-sans text-[15px] font-semibold tracking-[0.28em] text-nexus-text">
            OPERATION NEXUS
          </h1>
          {subtitle ? (
            <span className="truncate font-mono text-[11px] uppercase tracking-[0.22em] text-nexus-amber">
              {subtitle}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {credits !== null && credits !== undefined ? (
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "font-mono text-2xl font-semibold tabular-nums",
                credits < 20 ? "text-nexus-danger" : "text-nexus-amber",
              )}
            >
              {credits}
            </span>
            <span
              className={cn(
                "font-mono text-[10px] uppercase tracking-[0.18em]",
                credits < 20 ? "text-nexus-danger/70" : "text-nexus-amber/70",
              )}
            >
              cr
            </span>
          </div>
        ) : null}
        {round !== null && round !== undefined ? (
          <Badge tone="amber">Round {round}</Badge>
        ) : null}
        {live ? (
          <Badge tone={liveTone}>
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full bg-current",
                live === "open" && "nexus-live-dot",
              )}
            />
            {liveLabel}
          </Badge>
        ) : null}
        {right}
      </div>
    </header>
  );
}
