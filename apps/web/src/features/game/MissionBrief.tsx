interface MissionBriefProps {
  round: number;
  title?: string | null;
  credits: number;
  countdown: string;
}

const COPY: Record<number, { kicker: string; objective: string; rule: string }> = {
  1: {
    kicker: "TRIAGEM",
    objective: "Escolha onde vale a pena gastar inteligência. Perfis individuais podem enganar.",
    rule: "Observe primeiro. Investigue depois.",
  },
  2: {
    kicker: "CONEXÕES",
    objective: "Descubra quais relações merecem escalonamento — sem confundir correlação com fraude.",
    rule: "Uma aresta é um sinal, não uma sentença.",
  },
  3: {
    kicker: "IDENTIDADE",
    objective: "Cruze linguagem, evidência e identidade. Procure inconsistências que sobrevivam ao contexto.",
    rule: "Semântica ajuda; evidência fecha.",
  },
  4: {
    kicker: "FLUXO DO DINHEIRO",
    objective: "Reconstrua o fluxo, valide as datas e monte uma acusação que consiga ser provada.",
    rule: "Siga o dinheiro. Depois siga o tempo.",
  },
};

export function MissionBrief({ round, title, credits, countdown }: MissionBriefProps) {
  const copy = COPY[round] ?? COPY[1];

  return (
    <section
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 20px",
        height: 38,
        borderBottom: "1px solid var(--nx-line)",
        background: "var(--nx-card)",
      }}
    >
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: "var(--nx-accent-text)", flexShrink: 0 }}>
        MISSÃO
      </span>
      <span style={{ fontSize: 12.5, color: "var(--nx-ink)", fontWeight: 500 }}>{title ?? copy.kicker}</span>
      <span style={{ fontSize: 12.5, color: "var(--nx-muted)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {copy.objective}
      </span>
      <span style={{ fontSize: 11.5, color: "var(--nx-muted)", flexShrink: 0 }}>{copy.rule}</span>
      <div style={{ width: 1, height: 16, background: "var(--nx-line-2)", flexShrink: 0 }} />
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--nx-accent-text)", flexShrink: 0 }}>
        {credits} cr
      </span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--nx-ink)", flexShrink: 0 }}>
        {countdown}
      </span>
    </section>
  );
}
