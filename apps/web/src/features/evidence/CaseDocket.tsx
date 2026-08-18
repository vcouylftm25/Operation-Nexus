import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/Badge";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useGraphStore } from "@/features/graph/graphStore";
import { api } from "@/lib/client";
import type { CaseFile, TeamState } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CaseDocketProps {
  files: CaseFile[];
  teamId: string;
  sessionToken: string;
}

function formatMoney(value: number | null): string | null {
  if (value === null) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function CaseDocket({ files, teamId, sessionToken }: CaseDocketProps) {
  const queryClient = useQueryClient();
  const discovered = useGraphStore((s) => s.nodesById);
  const selectedId = useGraphStore((s) => s.selectedId);
  const people = files.filter((file) => file.labels.includes("Person"));
  const applications = files.filter((file) => file.labels.includes("Application"));

  const inspect = useMutation({
    mutationFn: (entityId: string) => api.investigate(teamId, `/inspect ${entityId}`, sessionToken),
    onSuccess: (result) => {
      useGraphStore.getState().merge(result.subgraph);
      queryClient.setQueryData<TeamState>(["team", teamId], (old) =>
        old ? { ...old, credits_balance: result.credits_remaining } : old,
      );
    },
  });

  function onInspect(entityId: string) {
    useGraphStore.getState().select(entityId);
    inspect.mutate(entityId);
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-4 px-3 py-3">
        <p className="text-[11px] leading-relaxed text-nexus-muted">
          Fichas na mesa — grátis de olhar. Abrir no grafo custa 5 cr. O pior score não é
          necessariamente o culpado.
        </p>
        {inspect.isError ? (
          <p className="text-xs text-nexus-danger">
            {inspect.error instanceof Error ? inspect.error.message : "Falha ao inspecionar."}
          </p>
        ) : null}
        <FileGroup
          title="Solicitantes"
          files={people}
          discovered={discovered}
          selectedId={selectedId}
          busy={inspect.isPending}
          onInspect={onInspect}
        />
        {applications.length > 0 ? (
          <FileGroup
            title="Propostas"
            files={applications}
            discovered={discovered}
            selectedId={selectedId}
            busy={inspect.isPending}
            onInspect={onInspect}
          />
        ) : null}
      </div>
    </ScrollArea>
  );
}

function FileGroup({
  title,
  files,
  discovered,
  selectedId,
  busy,
  onInspect,
}: {
  title: string;
  files: CaseFile[];
  discovered: Record<string, unknown>;
  selectedId: string | null;
  busy?: boolean;
  onInspect: (entityId: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-muted">
        {title} · {files.length}
      </p>
      <ul className="space-y-2">
        {files.map((file) => {
          const open = file.id in discovered;
          const selected = selectedId === file.id;
          const money = formatMoney(file.income_declared ?? file.amount);
          return (
            <li key={file.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onInspect(file.id)}
                className={cn(
                  "w-full rounded-sm border px-3 py-2 text-left transition-colors",
                  selected
                    ? "border-nexus-amber/50 bg-nexus-amber/10"
                    : "border-nexus-border hover:border-nexus-amber/30 hover:bg-white/4",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-tight">{file.label_display}</p>
                  {file.credit_score !== null ? (
                    <span
                      className={cn(
                        "font-mono text-xs tabular-nums",
                        file.credit_score < 560 ? "text-nexus-danger" : "text-nexus-muted",
                      )}
                    >
                      {file.credit_score}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-nexus-muted">
                  {[file.occupation, file.age ? `${file.age} anos` : null, money]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-nexus-muted">{file.id}</span>
                  {open ? <Badge tone="signal">no grafo</Badge> : <Badge tone="amber">5 cr</Badge>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
