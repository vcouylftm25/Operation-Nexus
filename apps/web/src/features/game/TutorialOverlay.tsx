import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface TutorialOverlayProps {
  storageKey: string;
}

const STEPS = [
  ["01 · MISSÃO", "Você não precisa descobrir tudo. Precisa decidir melhor que os outros times.", "Cada rodada libera um novo tipo de contexto. Transforme sinais soltos em uma hipótese defensável antes do tempo acabar.", "Comece pelos perfis. O grafo não aparece no Round 1 de propósito."],
  ["02 · CRÉDITOS DE INTELIGÊNCIA", "Toda investigação tem custo.", "Inspecionar pessoas, expandir conexões, buscar evidências e desafiar hipóteses consome créditos.", "O melhor time não é o que consulta mais. É o que faz as melhores perguntas."],
  ["03 · GRAFO", "No Round 2, as relações entram no caso.", "Dispositivos, contas, endereços, IPs e outras entidades aparecem conforme sua equipe investiga.", "Uma conexão é um sinal. Não é um veredito."],
  ["04 · INVESTIGADOR", "A IA é seu analista júnior — não o gabarito.", "Peça conexões, caminhos, linhas do tempo e evidências. Ela enxerga o mesmo universo liberado para a equipe.", "Use a IA para testar hipóteses, não para terceirizar a acusação."],
  ["05 · LOCK-IN", "No final, sua equipe precisa se comprometer.", "Escolha quem participou, quem coordenou o esquema, qual padrão explica o caso e quais evidências sustentam a acusação.", "Pontos vêm de prova estrutural — e de evitar falsos positivos."],
] as const;

export function TutorialOverlay({ storageKey }: TutorialOverlayProps) {
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) !== "done");
  const [step, setStep] = useState(0);
  if (!open) return null;

  const [eyebrow, title, body, accent] = STEPS[step];
  const finish = () => {
    localStorage.setItem(storageKey, "done");
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#05070b]/88 px-5 backdrop-blur-md">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#0d1119] shadow-2xl shadow-black/60">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-nexus-amber/80 to-transparent" />
        <div className="grid md:grid-cols-[0.78fr_1.22fr]">
          <aside className="border-b border-white/8 bg-white/[0.025] p-7 md:border-r md:border-b-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-nexus-amber/30 bg-nexus-amber/10 font-mono text-xs font-semibold text-nexus-amber">NX</div>
              <div><p className="font-mono text-[10px] uppercase tracking-[0.24em] text-nexus-muted">Operation Nexus</p><p className="mt-1 text-sm font-medium text-nexus-text">Briefing de campo</p></div>
            </div>
            <div className="mt-8 space-y-2">
              {STEPS.map((item, index) => (
                <button key={item[0]} type="button" onClick={() => setStep(index)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/[0.035]">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full border font-mono text-[10px] ${index === step ? "border-nexus-amber bg-nexus-amber text-[#111]" : index < step ? "border-nexus-signal/40 bg-nexus-signal/10 text-nexus-signal" : "border-white/10 text-nexus-muted"}`}>{index < step ? "✓" : index + 1}</span>
                  <span className={`text-xs ${index === step ? "text-nexus-text" : "text-nexus-muted"}`}>{item[0].replace(/^\d+ · /, "")}</span>
                </button>
              ))}
            </div>
          </aside>
          <main className="p-7 md:p-10">
            <div className="flex items-center justify-between gap-4"><p className="font-mono text-[10px] uppercase tracking-[0.28em] text-nexus-amber">{eyebrow}</p><button type="button" onClick={finish} className="text-xs text-nexus-muted hover:text-nexus-text">Pular tutorial</button></div>
            <h2 className="mt-7 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.035em] text-white">{title}</h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-nexus-muted">{body}</p>
            <div className="mt-8 rounded-2xl border border-nexus-amber/20 bg-nexus-amber/[0.06] p-4"><p className="text-sm leading-6 text-[#f5d995]">{accent}</p></div>
            <div className="mt-10 flex items-center justify-between gap-3"><div className="flex gap-1.5">{STEPS.map((item, index) => <span key={item[0]} className={`h-1.5 rounded-full ${index === step ? "w-7 bg-nexus-amber" : "w-1.5 bg-white/15"}`} />)}</div><div className="flex gap-2">{step > 0 ? <Button variant="ghost" onClick={() => setStep((value) => value - 1)}>Voltar</Button> : null}<Button onClick={() => (step === STEPS.length - 1 ? finish() : setStep((value) => value + 1))}>{step === STEPS.length - 1 ? "Entrar na operação" : "Continuar"}</Button></div></div>
          </main>
        </div>
      </div>
    </div>
  );
}
