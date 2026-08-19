import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface TutorialOverlayProps {
  storageKey: string;
}

const STEPS = [
  ["01 · MISSÃO", "Uma quadrilha pediu crédito fingindo ser oito clientes diferentes.", "A equipe atravessa três fases no próprio ritmo: vocês mesmos apertam “avançar” quando acharem que já entenderam a fase.", "Comecem pelas fichas. Na fase 1 o grafo aparece vazio de propósito."],
  ["02 · CRÉDITOS", "Toda consulta custa crédito.", "Inspecionar pessoas, expandir conexões, buscar evidências e desafiar hipóteses gastam do saldo. Cada fase nova credita mais.", "A melhor equipe não é a que mais consulta. É a que faz as melhores perguntas."],
  ["03 · O GRAFO", "Na fase 2 as ligações entram no caso.", "Aparelhos, telefones, contas e endereços aparecem conforme vocês investigam — e um mesmo item usado por duas pessoas é o começo de tudo.", "Uma conexão é um indício. Não é um veredito."],
  ["04 · VERA", "A Vera é a analista de vínculos da equipe — não o gabarito.", "Peça conexões, caminhos, linhas do tempo e trechos de evidência. Ela enxerga só o que já foi liberado para vocês.", "Use a Vera para testar a hipótese, não para terceirizar a acusação."],
  ["05 · A ACUSAÇÃO", "Na fase 3 vocês apontam quem coordenou o esquema.", "São três tentativas, com resposta na hora. Acertar cedo, gastando pouco, vale mais pontos — e o placar da sala mostra como está cada equipe.", "Quem coordena costuma aparecer pouco no grafo. Leiam as mensagens."],
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
