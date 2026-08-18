import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCredits(value: number): string {
  return `${value} cr`;
}

export function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function remainingSeconds(
  startedAt: string | null,
  durationSeconds: number | null,
  tickRemaining: number | null,
  nowMs: number = Date.now(),
): number | null {
  if (tickRemaining !== null) return Math.max(0, tickRemaining);
  if (!startedAt || durationSeconds === null) return null;
  const elapsed = (nowMs - Date.parse(startedAt)) / 1000;
  if (Number.isNaN(elapsed)) return durationSeconds;
  return Math.max(0, Math.ceil(durationSeconds - elapsed));
}

export function propertyText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function teamDisplayName(
  teams: { team_id: string; name: string }[],
  teamId: string,
  fallback = "Equipe",
): string {
  return teams.find((t) => t.team_id === teamId)?.name ?? fallback;
}
