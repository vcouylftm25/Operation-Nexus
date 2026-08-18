import { ScrollArea } from "@/components/ui/ScrollArea";
import { useGraphStore, useTeamGraphPayload } from "@/features/graph/graphStore";
import { useLiveStore } from "@/features/game/liveStore";
import { colorForLabels, primaryLabel } from "@/features/graph/colors";
import { cn, propertyText } from "@/lib/utils";

export function EvidenceDrawer({ embedded = false }: { embedded?: boolean }) {
  const payload = useTeamGraphPayload();
  const selectedId = useGraphStore((s) => s.selectedId);
  const unlocked = useLiveStore((s) => s.unlockedEvidence);
  const selected = payload.nodes.find((n) => n.id === selectedId) ?? null;

  const evidence = payload.nodes.filter(
    (n) => n.labels.includes("Evidence") || n.labels.includes("Message"),
  );
  const others = payload.nodes.filter(
    (n) => !n.labels.includes("Evidence") && !n.labels.includes("Message"),
  );

  return (
    <section
      className={
        embedded
          ? "flex h-full min-h-0 flex-col"
          : "nexus-panel flex h-full min-h-0 flex-col rounded-none border-y-0 border-l-0"
      }
    >
      {embedded ? null : (
      <header className="border-b border-nexus-border px-4 py-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-nexus-muted">Evidências</p>
        <p className="mt-1 font-mono text-[10px] text-nexus-amber">
          {payload.nodes.length} nós · {payload.relationships.length} relações
        </p>
      </header>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-3 py-3">
          {unlocked.length > 0 ? (
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-amber">
                Pistas liberadas
              </p>
              <ul className="space-y-1">
                {unlocked.map((item, index) => (
                  <li
                    key={`${item.id ?? item.evidence_id ?? index}`}
                    className="rounded-sm border border-nexus-amber/30 bg-nexus-amber/5 px-2 py-2 text-xs"
                  >
                    <p className="font-mono text-nexus-amber">{item.id ?? item.evidence_id}</p>
                    {item.excerpt ? <p className="mt-1 text-nexus-text/90">{item.excerpt}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <NodeGroup title="Material" nodes={evidence} selectedId={selectedId} />
          <NodeGroup title="Entidades" nodes={others} selectedId={selectedId} />

          {selected ? (
            <div className="rounded-sm border border-nexus-border bg-nexus-bg/50 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-muted">
                {primaryLabel(selected.labels)}
              </p>
              <p className="mt-1 text-sm font-medium">{selected.label_display}</p>
              <p className="font-mono text-[11px] text-nexus-amber">{selected.id}</p>
              <dl className="mt-3 space-y-1.5">
                {Object.entries(selected.properties).map(([key, value]) => (
                  <div key={key}>
                    <dt className="font-mono text-[10px] uppercase tracking-wider text-nexus-muted">{key}</dt>
                    <dd className="text-xs leading-relaxed text-nexus-text/90">{propertyText(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className="px-1 text-xs text-nexus-muted">Selecione um nó no grafo ou na lista.</p>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}

function NodeGroup({
  title,
  nodes,
  selectedId,
}: {
  title: string;
  nodes: { id: string; labels: string[]; label_display: string }[];
  selectedId: string | null;
}) {
  if (nodes.length === 0) return null;
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-nexus-muted">{title}</p>
      <ul className="space-y-1">
        {nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              onClick={() => useGraphStore.getState().select(node.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left text-xs transition-colors",
                selectedId === node.id
                  ? "border-nexus-amber/50 bg-nexus-amber/10"
                  : "border-nexus-border hover:border-nexus-amber/30 hover:bg-white/4",
              )}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: colorForLabels(node.labels) }}
              />
              <span className="min-w-0 flex-1 truncate">{node.label_display}</span>
              <span className="font-mono text-[10px] text-nexus-muted">{node.id}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
