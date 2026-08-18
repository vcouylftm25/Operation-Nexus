/**
 * The player's own reading of the board: every node and edge can be marked
 * Suspeito / Incerto / Explicado.
 *
 * This is a hypothesis, never a correctness signal. Nothing here is sent to
 * the API, nothing the API returns may confirm or deny a mark, and no code may
 * compare a mark against ground truth — the whole point of the exercise is
 * that the team argues its own case (see the graph workspace handoff, "State
 * Management / Critical rule from the game design").
 */
export type Classification = "suspect" | "uncertain" | "explained";

export const CLASSIFICATIONS: readonly Classification[] = ["suspect", "uncertain", "explained"];

const LABELS: Record<Classification, string> = {
  suspect: "Suspeito",
  uncertain: "Incerto",
  explained: "Explicado",
};

const COLORS: Record<Classification, string> = {
  suspect: "var(--nx-danger)",
  uncertain: "var(--nx-attention)",
  explained: "var(--nx-explained)",
};

export function classificationLabel(value: Classification): string {
  return LABELS[value];
}

export function classificationColor(value: Classification): string {
  return COLORS[value];
}

export type ClassificationMap = Record<string, Classification>;

/** One board per team: two teams on the same device must not share marks. */
export function classificationStorageKey(teamId: string): string {
  return `nexus-classification-${teamId}`;
}

function isClassification(value: unknown): value is Classification {
  return value === "suspect" || value === "uncertain" || value === "explained";
}

export function readClassification(teamId: string): ClassificationMap {
  try {
    const raw = localStorage.getItem(classificationStorageKey(teamId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: ClassificationMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (isClassification(value)) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeClassification(teamId: string, map: ClassificationMap): void {
  try {
    localStorage.setItem(classificationStorageKey(teamId), JSON.stringify(map));
  } catch {
    // A full or blocked storage must never break the board mid-game.
  }
}
