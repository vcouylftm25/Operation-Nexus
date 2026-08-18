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
    <section className="border-b border-white/[0.07] bg-[#0b0f16]/92 px-5 py-3">
      <div className="mx-auto flex max-w-[1800px] items-center gap-5">
        <div className="hidden min-w-[112px] md:block">
          <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-nexus-muted">Missão atual</p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-nexus-amber">
            R{round} · {copy.kicker}
          </p>
        </div>
        <div className="min-w-0 flex-1 border-l border-white/8 pl-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="truncate text-sm font-semibold tracking-[-0.01em] text-white">{title ?? copy.kicker}</h1>
            <span className="text-xs text-nexus-muted">{copy.rule}</span>
          </div>
          <p className="mt-1 truncate text-xs text-nexus-muted">{copy.objective}</p>
        </div>
        <div className="flex shrink-0 items-center gap-5">
          <div className="text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-nexus-muted">Intel</p>
            <p className="mt-0.5 font-mono text-sm tabular-nums text-nexus-amber">{credits} cr</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-nexus-muted">Tempo</p>
            <p className="mt-0.5 font-mono text-sm tabular-nums text-white">{countdown}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
