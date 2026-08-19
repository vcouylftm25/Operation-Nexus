import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import type { PendingSpend } from "./useInvestigatorSession";

interface ConfirmSpendDialogProps {
  spend: PendingSpend | null;
  balance?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Replaces `window.confirm` for spends past the cheap threshold. The native
 * dialog announced the Static Web Apps hostname to the room and could not be
 * styled; this one also lets Enter confirm, so a double-click on a node stays
 * a two-keystroke gesture rather than a trip to the mouse.
 */
export function ConfirmSpendDialog({ spend, balance, onConfirm, onCancel }: ConfirmSpendDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!spend) return;
    confirmRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
      if (event.key === "Enter") onConfirm();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spend, onConfirm, onCancel]);

  if (!spend) return null;

  const remaining = balance === undefined ? undefined : balance - spend.cost;
  const tight = remaining !== undefined && remaining < 20;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[#05070b]/80 px-5 backdrop-blur-sm"
      onClick={onCancel}
      data-testid="confirm-spend"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0d1119] shadow-2xl shadow-black/60"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Confirmar gasto de créditos"
      >
        <div className="h-px bg-gradient-to-r from-transparent via-nexus-amber/80 to-transparent" />
        <div className="p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-nexus-amber">
            Confirmar consulta
          </p>
          <h2 className="mt-3 text-lg font-semibold leading-snug text-white">{spend.label}</h2>

          <div className="mt-5 flex items-stretch gap-2">
            <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-nexus-muted">Custo</p>
              <p className="mt-1 font-mono text-lg text-nexus-amber">{spend.cost} cr</p>
            </div>
            {remaining !== undefined ? (
              <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-nexus-muted">
                  Saldo depois
                </p>
                <p className={`mt-1 font-mono text-lg ${tight ? "text-nexus-danger" : "text-nexus-text"}`}>
                  {remaining} cr
                </p>
              </div>
            ) : null}
          </div>

          <p className="mt-4 text-xs leading-6 text-nexus-muted">
            {tight
              ? "O saldo fica curto para a fase. Vale conferir se essa é mesmo a pergunta que vocês querem fazer agora."
              : "Créditos gastos não voltam, mas cada fase nova credita mais."}
          </p>

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button ref={confirmRef} onClick={onConfirm}>
              Investigar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
