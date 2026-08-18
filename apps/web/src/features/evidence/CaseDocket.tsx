import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useGraphStore } from "@/features/graph/graphStore";
import { api } from "@/lib/client";
import type { CaseFile, TeamState } from "@/lib/types";

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
      <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--nx-muted)" }}>
          Fichas na mesa — compare sinais individuais, escolha seus alvos e só depois siga as
          conexões. Abrir uma ficha no grafo custa 5 cr.
        </p>
        {inspect.isError ? (
          <p style={{ fontSize: 12, color: "var(--nx-danger)" }}>
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
      <p style={{ marginBottom: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: "var(--nx-muted)", textTransform: "uppercase" }}>
        {title} · {files.length}
      </p>
      <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: `1px solid ${selected ? "var(--nx-accent-45)" : "var(--nx-line)"}`,
                  background: selected ? "var(--nx-elev)" : "var(--nx-card)",
                  padding: "11px 13px",
                  textAlign: "left",
                  cursor: busy ? "default" : "pointer",
                  boxShadow: "0 1px 2px var(--nx-shadow-1)",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: "var(--nx-ink)" }}>{file.label_display}</p>
                  {file.credit_score !== null ? (
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: file.credit_score < 560 ? "var(--nx-danger)" : "var(--nx-muted)" }}>
                      {file.credit_score}
                    </span>
                  ) : null}
                </div>
                <p style={{ marginTop: 4, fontSize: 11, color: "var(--nx-muted)" }}>
                  {[file.occupation, file.age ? `${file.age} anos` : null, money].filter(Boolean).join(" · ")}
                </p>
                <div style={{ marginTop: 9, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "var(--nx-muted)" }}>
                    {open ? "descoberto" : "abrir ficha"}
                  </span>
                  <span
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 9.5,
                      letterSpacing: "0.12em",
                      padding: "2px 7px",
                      borderRadius: 999,
                      border: `1px solid ${open ? "var(--nx-accent-30)" : "var(--nx-line-2)"}`,
                      color: open ? "var(--nx-accent-text)" : "var(--nx-accent-text)",
                      background: open ? "var(--nx-accent-08)" : "transparent",
                    }}
                  >
                    {open ? "descoberto" : "5 cr · investigar"}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
