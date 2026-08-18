import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { displayName, type PlayerRoundBrief } from "@/lib/mock/gameDesign";
import type { CaseFile } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MissionGateProps {
  brief: PlayerRoundBrief;
  files: CaseFile[];
  committed: string[];
  onConfirm: (ids: string[]) => void;
}

export function MissionGate({ brief, files, committed, onConfirm }: MissionGateProps) {
  const people = useMemo(() => files.filter((file) => file.labels.includes("Person")), [files]);
  const [selected, setSelected] = useState<string[]>(committed);
  const isLocked = committed.length > 0;
  const maxTargets = brief.gateKind === "TARGETS" ? 3 : 3;
  const minTargets = brief.gateKind === "TARGETS" ? 3 : 1;

  function toggle(id: string) {
    if (isLocked) return;
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < maxTargets
          ? [...current, id]
          : current,
    );
  }

  return (
    <main className="min-h-0 overflow-auto px-5 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-nexus-amber">
              {brief.eyebrow}
            </p>
            <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-nexus-text lg:text-5xl">
              {brief.title}
            </h2>
          </div>
          <Badge tone={isLocked ? "signal" : "amber"}>
            {isLocked ? "DECISÃO TRAVADA" : `${selected.length}/${maxTargets} SELECIONADOS`}
          </Badge>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section>
            <div className="nexus-panel mb-4 rounded-md border-nexus-amber/25 p-5">
              <p className="text-lg leading-relaxed text-nexus-text">{brief.briefing}</p>
              <p className="mt-3 text-sm leading-relaxed text-nexus-muted">{brief.objective}</p>
            </div>

            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-nexus-muted">
                  {brief.decision}
                </p>
                <p className="mt-1 text-xs text-nexus-muted">{brief.decisionHint}</p>
              </div>
              <span className="font-mono text-xs tabular-nums text-nexus-amber">
                {selected.length}/{maxTargets}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {people.map((person) => {
                const active = selected.includes(person.id);
                const score = person.credit_score ?? 0;
                return (
                  <button
                    key={person.id}
                    type="button"
                    disabled={isLocked}
                    onClick={() => toggle(person.id)}
                    className={cn(
                      "nexus-panel rounded-md p-4 text-left transition-all",
                      active
                        ? "border-nexus-amber bg-nexus-amber/10 shadow-[0_0_22px_rgb(245_185_66/0.12)]"
                        : "hover:border-nexus-amber/40 hover:bg-white/[0.04]",
                      isLocked && !active && "opacity-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-nexus-text">{displayName(person)}</p>
                      <span
                        className={cn(
                          "font-mono text-sm tabular-nums",
                          score < 560 ? "text-nexus-danger" : score > 740 ? "text-nexus-signal" : "text-nexus-muted",
                        )}
                      >
                        {score}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-nexus-muted">
                      {[person.occupation, person.income_declared ? formatMoney(person.income_declared) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="mt-5 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-muted">
                        {active ? "alvo selecionado" : "perfil individual"}
                      </span>
                      <span className={cn("text-lg", active ? "text-nexus-amber" : "text-nexus-muted")}>
                        {active ? "✓" : "+"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="nexus-panel h-fit rounded-md p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-nexus-muted">Checkpoint obrigatório</p>
            <p className="mt-3 text-2xl font-semibold text-nexus-text">
              {isLocked ? "A equipe está comprometida." : "Decisão antes do dado."}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-nexus-muted">
              {isLocked
                ? "A investigação agora pode começar. O próximo intel só entra quando o host avançar a missão."
                : "Escolham com o que sabem agora. Não há como trocar os alvos depois do lock-in."}
            </p>
            <Button
              className="mt-6 w-full"
              size="lg"
              disabled={isLocked || selected.length < minTargets}
              onClick={() => onConfirm(selected)}
            >
              {isLocked ? "Investigação liberada" : brief.gateKind === "TARGETS" ? "Confirmar alvos" : "Travar teoria"}
            </Button>
            {brief.gateKind === "TARGETS" ? (
              <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-muted">
                3 escolhas · sem troca
              </p>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
