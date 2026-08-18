import { ScrollArea } from "@/components/ui/ScrollArea";
import { useGraphStore, useTeamGraphPayload } from "@/features/graph/graphStore";
import { useLiveStore } from "@/features/game/liveStore";
import { colorForLabels, labelDisplay, propertyDisplay } from "@/features/graph/colors";
import { propertyText } from "@/lib/utils";

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
    <section style={{ display: "flex", height: "100%", minHeight: 0, flexDirection: "column" }}>
      {embedded ? null : (
        <header style={{ borderBottom: "1px solid var(--nx-line)", padding: "12px 16px" }}>
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.22em", color: "var(--nx-muted)", textTransform: "uppercase" }}>
            Evidências
          </p>
          <p style={{ marginTop: 4, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "var(--nx-accent-text)" }}>
            {payload.nodes.length} nós · {payload.relationships.length} relações
          </p>
        </header>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 16 }}>
          {unlocked.length > 0 ? (
            <div>
              <p style={{ marginBottom: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: "var(--nx-accent-text)", textTransform: "uppercase" }}>
                Pistas liberadas
              </p>
              <ul style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {unlocked.map((item, index) => (
                  <li
                    key={`${item.id ?? item.evidence_id ?? index}`}
                    style={{ borderRadius: 10, border: "1px solid var(--nx-accent-30)", background: "var(--nx-accent-06)", padding: "8px 10px", fontSize: 12 }}
                  >
                    <p style={{ fontWeight: 500, color: "var(--nx-ink)" }}>
                      {item.evidence_type === "message" ? "Mensagem recuperada" : "Evidência liberada"}
                    </p>
                    {item.excerpt ? (
                      <p style={{ marginTop: 4, lineHeight: 1.5, color: "var(--nx-ink)" }}>“{item.excerpt}”</p>
                    ) : (
                      <p style={{ marginTop: 4, fontSize: 11, color: "var(--nx-muted)" }}>Material liberado pelo host.</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <NodeGroup title="Material" nodes={evidence} selectedId={selectedId} />
          <NodeGroup title="Entidades" nodes={others} selectedId={selectedId} />

          {selected ? (
            <div style={{ borderRadius: 12, border: "1px solid var(--nx-line)", background: "var(--nx-card)", padding: 12 }}>
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: "var(--nx-muted)", textTransform: "uppercase" }}>
                {labelDisplay(selected.labels)}
              </p>
              <p style={{ marginTop: 4, fontSize: 13, fontWeight: 500, color: "var(--nx-ink)" }}>{selected.label_display}</p>
              <dl style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(selected.properties).map(([key, value]) => (
                  <div key={key}>
                    <dt style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: "var(--nx-muted)", textTransform: "uppercase" }}>
                      {propertyDisplay(key)}
                    </dt>
                    <dd style={{ fontSize: 12, lineHeight: 1.5, color: "var(--nx-ink)" }}>{propertyText(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--nx-muted)" }}>Selecione um nó no grafo ou na lista.</p>
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
      <p style={{ marginBottom: 8, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: "var(--nx-muted)", textTransform: "uppercase" }}>
        {title}
      </p>
      <ul style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              onClick={() => useGraphStore.getState().select(node.id)}
              style={{
                display: "flex",
                width: "100%",
                alignItems: "center",
                gap: 8,
                borderRadius: 9,
                border: `1px solid ${selectedId === node.id ? "var(--nx-accent-45)" : "var(--nx-line)"}`,
                background: selectedId === node.id ? "var(--nx-accent-08)" : "transparent",
                padding: "6px 8px",
                textAlign: "left",
                fontSize: 12,
                cursor: "pointer",
                color: "var(--nx-ink)",
              }}
            >
              <span style={{ width: 8, height: 8, flexShrink: 0, borderRadius: "50%", background: colorForLabels(node.labels) }} />
              <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.label_display}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
