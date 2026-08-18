import type { CSSProperties } from "react";
import { estimateCommandCost } from "./commands";

interface ToolPaletteProps {
  onPick: (command: string) => void;
  disabled?: boolean;
  selectedIds: string[];
}

interface QuickAction {
  id: string;
  label: string;
  build: (sel: string[]) => string | null;
}

/**
 * Quick-action chips, built from the real DSL (see commands.ts's
 * `TOOL_PALETTE` for the authoritative command syntax) parameterized by
 * whatever is currently selected on the canvas — not a separate hardcoded
 * list. `/search` is free-text-only (no entity to default to) so it isn't a
 * one-click chip here; it's still reachable by typing it in the ask box.
 */
const QUICK_ACTIONS: QuickAction[] = [
  { id: "inspect", label: "Inspecionar", build: (sel) => (sel[0] ? `/inspect ${sel[0]}` : null) },
  {
    id: "shared",
    label: "Conexões em comum",
    build: (sel) => (sel.length >= 2 ? `/shared ${sel[0]},${sel[1]}` : null),
  },
  {
    id: "path",
    label: "Encontrar caminho",
    build: (sel) => (sel.length >= 2 ? `/path ${sel[0]} ${sel[1]}` : null),
  },
  { id: "expand", label: "Expandir rede", build: (sel) => (sel[0] ? `/expand ${sel[0]} 1` : null) },
  { id: "timeline", label: "Linha do tempo", build: (sel) => (sel[0] ? `/timeline ${sel[0]}` : null) },
  {
    id: "challenge",
    label: "Desafiar hipótese",
    build: (sel) =>
      sel.length >= 2
        ? `/challenge Existe uma explicação alternativa para esta conexão? | ${sel[0]},${sel[1]}`
        : null,
  },
];

const chipStyle = (enabled: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 10px",
  border: `1px solid var(--nx-line-2)`,
  borderRadius: 999,
  background: "var(--nx-card)",
  cursor: enabled ? "pointer" : "default",
  opacity: enabled ? 1 : 0.4,
  fontSize: 11.5,
  color: "var(--nx-ink)",
});

export function ToolPalette({ onPick, disabled, selectedIds }: ToolPaletteProps) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {QUICK_ACTIONS.map((action) => {
        const command = action.build(selectedIds);
        const enabled = !disabled && command !== null;
        return (
          <button
            key={action.id}
            type="button"
            disabled={!enabled}
            onClick={() => command && onPick(command)}
            style={chipStyle(enabled)}
          >
            <span>{action.label}</span>
            {command ? (
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--nx-accent-text)" }}>
                {estimateCommandCost(command)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
