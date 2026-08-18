/**
 * Coaching copy that sits next to each phase's briefing.
 *
 * The title and the narrative of a phase come from the scenario (the server
 * sends them in `RoundState`). What lives here is the constant part the game
 * teaches in every scenario: what the team is supposed to *do* in this phase,
 * the one rule beginners get wrong, and what the graph is expected to look
 * like — so an empty canvas in phase 1 reads as designed rather than broken.
 */

export interface PhaseBrief {
  number: number;
  eyebrow: string;
  objective: string;
  rule: string;
  graphHint: string;
}

export const PHASE_BRIEFS: PhaseBrief[] = [
  {
    number: 1,
    eyebrow: "FASE 1 · TRIAGEM",
    objective: "Leiam as fichas inteiras e anotem perguntas, não culpados.",
    rule: "Nenhuma ficha isolada prova fraude.",
    graphHint:
      "Nesta fase o grafo mostra só pessoas e propostas, sem nenhuma ligação. As conexões entram na fase 2.",
  },
  {
    number: 2,
    eyebrow: "FASE 2 · CONEXÕES",
    objective: "Procurem itens usados por mais de uma pessoa e classifiquem cada um.",
    rule: "Uma conexão é um indício, não uma sentença.",
    graphHint:
      "Aparelhos, telefones e contas aparecem aqui. Abram cada nó compartilhado antes de concluir qualquer coisa.",
  },
  {
    number: 3,
    eyebrow: "FASE 3 · MENSAGENS E DINHEIRO",
    objective: "Sigam para onde o dinheiro converge e leiam quem dá as instruções.",
    rule: "Quem coordena aparece pouco no grafo — mas aparece por escrito.",
    graphHint:
      "Mensagens, extratos e transferências completam a rede. É agora que a acusação fica possível.",
  },
];

const FALLBACK: PhaseBrief = {
  number: 0,
  eyebrow: "INVESTIGAÇÃO",
  objective: "Investiguem com o que já está na mesa e gastem créditos com critério.",
  rule: "Correlação não é prova.",
  graphHint: "O grafo cresce conforme a equipe investiga.",
};

export function phaseBrief(number: number): PhaseBrief {
  return PHASE_BRIEFS.find((brief) => brief.number === number) ?? { ...FALLBACK, number };
}
