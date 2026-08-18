import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/client";
import type { TeamState } from "@/lib/types";

interface HostRosterProps {
  gameId: string;
  teams: TeamState[];
}

export function HostRoster({ gameId, teams }: HostRosterProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (teamName: string) => api.createTeam(gameId, teamName),
    onSuccess: () => {
      setName("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["game", gameId] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Falha ao criar equipe."),
  });

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      window.setTimeout(() => setCopied((current) => (current === code ? null : current)), 1500);
    } catch {
      setError("Não deu para copiar. Selecione o código na tela.");
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(trimmed);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Códigos das equipes</CardTitle>
      </CardHeader>
      <p className="mb-3 text-xs leading-relaxed text-nexus-muted">
        Compartilhe o game id para que cada grupo crie seu próprio nome e receba um código de 6 letras. Você também pode criar uma equipe manualmente abaixo.
      </p>
      {teams.length === 0 ? (
        <p className="text-sm text-nexus-muted">Nenhuma equipe ainda. Crie as quatro mesas abaixo.</p>
      ) : (
        <ul className="space-y-2">
          {teams.map((team) => (
            <li
              key={team.team_id}
              className="flex items-center justify-between gap-3 rounded-sm border border-nexus-border bg-nexus-bg/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{team.name}</p>
                <p className="font-mono text-xl tracking-[0.28em] text-nexus-amber">{team.join_code}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copyCode(team.join_code)}
              >
                {copied === team.join_code ? "Copiado" : "Copiar"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form className="mt-4 flex gap-2" onSubmit={onSubmit}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nova equipe"
        />
        <Button type="submit" variant="outline" disabled={create.isPending || name.trim().length === 0}>
          Criar
        </Button>
      </form>
      {error ? <p className="mt-2 text-xs text-nexus-danger">{error}</p> : null}
    </Card>
  );
}
