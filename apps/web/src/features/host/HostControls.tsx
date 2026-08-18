import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/client";

interface HostControlsProps { gameId: string; hostToken: string; currentRound: number; countdownSeconds: number | null; }

const HOST_CLUES: Record<number, { id: string; title: string; subtitle: string }[]> = {
  1: [{ id: "evidence_01", title: "Pista sutil", subtitle: "Reforce que score é só um sinal, sem revelar a resposta." }],
  2: [{ id: "evidence_02", title: "Contexto de infraestrutura", subtitle: "Ajuda a diferenciar acesso público de vínculo real." }],
  3: [{ id: "evidence_01", title: "Laudo comportamental", subtitle: "Material de identidade e autoria operacional." }],
  4: [
    { id: "evidence_05", title: "Auditoria temporal", subtitle: "Uma inconsistência de datas pode desmontar uma conexão." },
    { id: "evidence_08", title: "Registro societário", subtitle: "Use apenas se os times não fecharem o caminho corporativo." },
  ],
};

export function HostControls({ gameId, hostToken, currentRound, countdownSeconds }: HostControlsProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const revealsQuery = useQuery({
    queryKey: ["reveals", gameId],
    queryFn: () => api.hostReveals(gameId, hostToken),
  });
  const revealed = new Set(
    (revealsQuery.data ?? []).map((item) => item.evidence_id ?? item.id),
  );
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["game", gameId] });
    void queryClient.invalidateQueries({ queryKey: ["scoreboard", gameId] });
  };
  const start = useMutation({ mutationFn: (round: number) => api.hostStartRound(gameId, round, hostToken), onSuccess: invalidate, onError: (err) => setError(err instanceof Error ? err.message : "Falha ao iniciar round.") });
  const next = useMutation({
    mutationFn: async () => {
      try { await api.hostNextRound(gameId, hostToken); } catch { /* already ended is safe to retry */ }
      return api.hostStartRound(gameId, currentRound + 1, hostToken);
    },
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Falha ao avançar round."),
  });
  const reveal = useMutation({ mutationFn: (id: string) => api.hostReveal(gameId, id, hostToken), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["reveals", gameId] }); }, onError: (err) => setError(err instanceof Error ? err.message : "Falha ao liberar pista.") });
  const finish = useMutation({ mutationFn: () => api.hostFinish(gameId, hostToken), onSuccess: invalidate, onError: (err) => setError(err instanceof Error ? err.message : "Falha ao finalizar.") });
  const busy = start.isPending || next.isPending || reveal.isPending || finish.isPending;
  const clues = HOST_CLUES[currentRound] ?? [];
  const autoAdvancedRound = useRef<number | null>(null);

  useEffect(() => {
    if (countdownSeconds !== 0 || currentRound <= 0 || currentRound >= 4 || busy || autoAdvancedRound.current === currentRound) return;
    autoAdvancedRound.current = currentRound;
    next.mutate();
  }, [busy, countdownSeconds, currentRound, next]);

  return <div className="space-y-5">
    <div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-nexus-muted">Controle da sessão</p><p className="mt-1 text-[11px] text-nexus-muted">A operação avança automaticamente quando o tempo zera.</p><div className="mt-2 flex flex-wrap gap-2">{currentRound <= 0 ? <Button disabled={busy} onClick={() => start.mutate(1)}>Iniciar operação</Button> : <Button variant="outline" disabled={busy || currentRound >= 4} onClick={() => next.mutate()}>Encerrar e abrir próximo round</Button>}<Button variant="danger" disabled={busy} onClick={() => finish.mutate()}>Finalizar operação</Button></div></div>
    <div><div className="flex items-center justify-between gap-3"><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-nexus-muted">Cartas do Game Master</p><span className="text-[10px] text-nexus-muted">use só se necessário</span></div><div className="mt-2 grid gap-2">{clues.length === 0 ? <p className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-3 text-xs text-nexus-muted">Nenhuma pista sugerida para este momento.</p> : clues.map((clue) => { const wasRevealed = revealed.has(clue.id); return <div key={`${currentRound}-${clue.id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.018] p-3"><div className="min-w-0 flex-1"><p className="text-xs font-medium text-white">{clue.title}</p><p className="mt-1 text-[11px] leading-4 text-nexus-muted">{clue.subtitle}</p></div><Button size="sm" variant={wasRevealed ? "ghost" : "signal"} disabled={busy || wasRevealed} onClick={() => reveal.mutate(clue.id)}>{wasRevealed ? "Liberada" : "Liberar"}</Button></div>; })}</div></div>
    {error ? <p className="text-xs text-nexus-danger">{error}</p> : null}
  </div>;
}
