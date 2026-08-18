import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/client";

interface HostControlsProps {
  gameId: string;
  hostToken: string;
  currentRound: number;
}

export function HostControls({ gameId, hostToken, currentRound }: HostControlsProps) {
  const queryClient = useQueryClient();
  const [evidenceId, setEvidenceId] = useState("evidence_01");
  const [error, setError] = useState<string | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["game", gameId] });
    void queryClient.invalidateQueries({ queryKey: ["scoreboard", gameId] });
  }

  const start = useMutation({
    mutationFn: (n: number) => api.hostStartRound(gameId, n, hostToken),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Falha ao iniciar round."),
  });

  const next = useMutation({
    mutationFn: async () => {
      try {
        await api.hostNextRound(gameId, hostToken);
      } catch {
        // round may already be ended — still try to start the next one
      }
      return api.hostStartRound(gameId, currentRound + 1, hostToken);
    },
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Falha ao avançar round."),
  });

  const reveal = useMutation({
    mutationFn: () => api.hostReveal(gameId, evidenceId.trim(), hostToken),
    onError: (err) => setError(err instanceof Error ? err.message : "Falha ao liberar pista."),
  });

  const finish = useMutation({
    mutationFn: () => api.hostFinish(gameId, hostToken),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof Error ? err.message : "Falha ao finalizar."),
  });

  const busy = start.isPending || next.isPending || reveal.isPending || finish.isPending;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => start.mutate(1)}>
          Iniciar round 1
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => next.mutate()}>
          Próximo round
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => finish.mutate()}>
          Finalizar
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[180px] flex-1 text-xs text-nexus-muted">
          Liberar pista (id)
          <Input
            className="mt-1 font-mono"
            value={evidenceId}
            onChange={(e) => setEvidenceId(e.target.value)}
          />
        </label>
        <Button variant="signal" disabled={busy || !evidenceId.trim()} onClick={() => reveal.mutate()}>
          Liberar pista
        </Button>
      </div>
      {error ? <p className="text-xs text-nexus-danger">{error}</p> : null}
    </div>
  );
}
