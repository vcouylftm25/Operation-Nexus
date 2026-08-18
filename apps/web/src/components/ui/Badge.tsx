import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "amber" | "signal" | "danger" | "muted" | "live";
}

export function Badge({ className, tone = "muted", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em]",
        tone === "amber" && "border-nexus-amber/40 text-nexus-amber bg-nexus-amber/10",
        tone === "signal" && "border-nexus-signal/40 text-nexus-signal bg-nexus-signal/10",
        tone === "danger" && "border-nexus-danger/40 text-nexus-danger bg-nexus-danger/10",
        tone === "muted" && "border-nexus-border text-nexus-muted bg-white/4",
        tone === "live" && "border-nexus-signal/50 text-nexus-signal bg-nexus-signal/10",
        className,
      )}
      {...props}
    />
  );
}
