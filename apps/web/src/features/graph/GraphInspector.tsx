/**
 * Node/edge detail. Lives in the left rail (it replaces the case files while
 * something is selected) rather than floating over the canvas, so it can never
 * cover the graph the player is reading.
 */
import { ScrollArea } from "@/components/ui/ScrollArea";
import { CLASSIFICATIONS, classificationColor, classificationLabel } from "./classification";
import { labelDisplay, relationshipDisplay } from "./colors";
import { useGraphStore } from "./graphStore";
import { useGraphViewStore } from "./graphViewStore";
import { propertyRows, type PropertyRow } from "./properties";

interface GraphInspectorProps {
  /** Runs an investigator command (`/expand …`) on the team's behalf. */
  onCommand: (command: string) => void;
}

export function GraphInspector({ onCommand }: GraphInspectorProps) {
  const nodesById = useGraphStore((s) => s.nodesById);
  const relsById = useGraphStore((s) => s.relsById);
  const selectedIds = useGraphStore((s) => s.selectedIds);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const classification = useGraphStore((s) => s.classification);
  const classify = useGraphStore((s) => s.classify);
  const clearSelection = useGraphStore((s) => s.select);

  const focusId = useGraphViewStore((s) => s.focusId);
  const toggleFocus = useGraphViewStore((s) => s.toggleFocus);
  const pinnedIds = useGraphViewStore((s) => s.pinnedIds);
  const togglePin = useGraphViewStore((s) => s.togglePin);
  const setMode = useGraphViewStore((s) => s.setMode);

  const node = selectedIds.length === 1 ? (nodesById[selectedIds[0]] ?? null) : null;
  const rel = selectedEdgeId ? (relsById[selectedEdgeId] ?? null) : null;

  const detail = node
    ? {
        id: node.id,
        kind: "ENTIDADE",
        title: node.label_display,
        subtitle: labelDisplay(node.labels),
        rows: propertyRows(node.properties),
      }
    : rel
      ? {
          id: rel.id,
          kind: "RELAÇÃO",
          title: relationshipDisplay(rel.type),
          subtitle: `${nodesById[rel.start_id]?.label_display ?? rel.start_id} → ${nodesById[rel.end_id]?.label_display ?? rel.end_id}`,
          rows: propertyRows(rel.properties),
        }
      : null;
  if (!detail) return null;

  const id = detail.id;
  const rows: PropertyRow[] = detail.rows;
  const marked = classification[id];

  return (
    <section className="flex min-h-0 flex-1 flex-col" data-testid="graph-inspector">
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
          padding: "12px 14px 10px",
          borderBottom: "1px solid var(--nx-line)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p style={eyebrowStyle}>{detail.kind}</p>
          <h2 style={{ marginTop: 5, fontSize: 16, fontWeight: 500, color: "var(--nx-ink)", overflowWrap: "anywhere" }}>
            {detail.title}
          </h2>
          <p style={{ marginTop: 3, fontSize: 11.5, color: "var(--nx-muted)", overflowWrap: "anywhere" }}>
            {detail.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => clearSelection(null)}
          style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "var(--nx-muted)" }}
          aria-label="Fechar detalhes"
          data-testid="close-inspector"
        >
          ✕
        </button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div style={{ padding: "12px 14px 18px" }}>
          {marked ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: classificationColor(marked) }} />
              <span style={{ fontSize: 11.5, color: "var(--nx-ink)" }}>{classificationLabel(marked)}</span>
            </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column" }}>
            {rows.length === 0 ? (
              <p style={{ fontSize: 11.5, color: "var(--nx-muted)" }}>
                Esta entidade não trouxe nenhum detalhe além do nome.
              </p>
            ) : (
              rows.map((row) =>
                row.long ? (
                  <div key={row.key} style={{ padding: "8px 0", borderBottom: "1px solid var(--nx-accent-06)" }}>
                    <p style={rowKeyStyle}>{row.label}</p>
                    <p
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        lineHeight: 1.6,
                        color: "var(--nx-ink)",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {row.value}
                    </p>
                  </div>
                ) : (
                  <div
                    key={row.key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "7px 0",
                      borderBottom: "1px solid var(--nx-accent-06)",
                    }}
                  >
                    <span style={rowKeyStyle}>{row.label}</span>
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 11,
                        color: "var(--nx-ink)",
                        textAlign: "right",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {row.value}
                    </span>
                  </div>
                ),
              )
            )}
          </div>

          <p style={{ ...eyebrowStyle, marginTop: 18 }}>CLASSIFICAR</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {CLASSIFICATIONS.map((value) => {
              const active = marked === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => classify(id, value)}
                  aria-pressed={active}
                  data-testid={`classify-${value}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 10px",
                    border: `1px solid ${active ? classificationColor(value) : "var(--nx-line-2)"}`,
                    borderRadius: 9,
                    background: active ? "var(--nx-accent-06)" : "var(--nx-card)",
                    cursor: "pointer",
                    fontSize: 11,
                    color: "var(--nx-ink)",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: classificationColor(value) }} />
                  {classificationLabel(value)}
                </button>
              );
            })}
          </div>
          <p style={{ marginTop: 8, fontSize: 10.5, lineHeight: 1.6, color: "var(--nx-muted)" }}>
            A marcação é a leitura da equipe. Ninguém confirma se está certa — ela só organiza o
            que vocês já conseguem defender.
          </p>

          <p style={{ ...eyebrowStyle, marginTop: 18 }}>INVESTIGAÇÕES DISPONÍVEIS</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {node ? (
              <>
                <button type="button" onClick={() => onCommand(`/expand ${node.id} 1`)} style={actionStyle}>
                  Expandir conexões
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCommand(`/timeline ${node.id}`);
                    setMode("timeline");
                  }}
                  style={actionStyle}
                >
                  Ver linha do tempo
                </button>
                <button type="button" onClick={() => toggleFocus(node.id)} style={actionStyle}>
                  {focusId === node.id ? "Sair do focus" : "Focus: só esta vizinhança"}
                </button>
                <button type="button" onClick={() => togglePin(node.id)} style={actionStyle}>
                  {pinnedIds[node.id] ? "Soltar posição" : "Fixar posição"}
                </button>
              </>
            ) : rel ? (
              <button type="button" onClick={() => onCommand(`/expand ${rel.end_id} 1`)} style={actionStyle}>
                Expandir {nodesById[rel.end_id]?.label_display ?? "destino"}
              </button>
            ) : null}
          </div>
        </div>
      </ScrollArea>
    </section>
  );
}

const eyebrowStyle = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 9.5,
  letterSpacing: "0.18em",
  color: "var(--nx-muted)",
} as const;

const rowKeyStyle = {
  fontSize: 10.5,
  letterSpacing: "0.08em",
  color: "var(--nx-muted)",
  textTransform: "uppercase",
} as const;

const actionStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "9px 11px",
  border: "1px solid var(--nx-line-2)",
  borderRadius: 9,
  background: "var(--nx-card)",
  cursor: "pointer",
  fontSize: 11.5,
  color: "var(--nx-ink)",
  textAlign: "left",
} as const;
