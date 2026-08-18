export interface PaletteCommand {
  id: string;
  label: string;
  command: string;
  cost: string;
}

/** Exact DSL the backend accepts when AI_ENABLED=false. Do not invent syntax. */
export const TOOL_PALETTE: readonly PaletteCommand[] = [
  { id: "inspect", label: "Inspecionar", command: "/inspect person_01", cost: "5" },
  { id: "shared", label: "Compartilhados", command: "/shared person_01,person_03", cost: "10" },
  { id: "path", label: "Caminho", command: "/path person_01 person_04", cost: "15" },
  { id: "expand", label: "Expandir", command: "/expand person_01 2", cost: "20" },
  { id: "timeline", label: "Linha do tempo", command: "/timeline person_01", cost: "10" },
  {
    id: "search",
    label: "Buscar evidência",
    command: "/search existe mensagem sobre usar o nome de outra pessoa",
    cost: "20",
  },
  {
    id: "challenge",
    label: "Desafiar hipótese",
    command: "/challenge Roberto é o líder | person_01,person_02",
    cost: "25",
  },
];

export function estimateCommandCost(command: string): number {
  const trimmed = command.trim();
  if (trimmed.startsWith("/inspect")) return 5;
  if (trimmed.startsWith("/shared") || trimmed.startsWith("/timeline")) return 10;
  if (trimmed.startsWith("/path")) return 15;
  if (trimmed.startsWith("/expand")) return /\s2\s*$/.test(trimmed) ? 20 : 15;
  if (trimmed.startsWith("/search")) return 20;
  if (trimmed.startsWith("/challenge")) return 25;
  return 10;
}
