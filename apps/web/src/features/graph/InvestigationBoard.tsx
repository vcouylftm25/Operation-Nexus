/**
 * Footer counters for the team's own marks on the graph. Reads the same
 * classification map the canvas paints from — a running tally of the
 * hypothesis, never a score.
 */
import { CLASSIFICATIONS, classificationColor, classificationLabel } from "./classification";
import { useClassificationCounts } from "./graphStore";

export function InvestigationBoard() {
  const counts = useClassificationCounts();
  const total = counts.suspect + counts.uncertain + counts.explained;

  return (
    <div style={{ padding: "10px 16px" }} data-testid="investigation-board">
      <p
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9.5,
          letterSpacing: "0.18em",
          color: "var(--nx-muted)",
        }}
      >
        PAINEL DA EQUIPE
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {CLASSIFICATIONS.map((value) => (
          <div
            key={value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "6px 10px",
              border: "1px solid var(--nx-line)",
              borderRadius: 10,
              background: "var(--nx-card)",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: classificationColor(value) }} />
            <span
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "var(--nx-ink)" }}
              data-testid={`board-count-${value}`}
            >
              {counts[value]}
            </span>
            <span style={{ fontSize: 10.5, letterSpacing: "0.06em", color: "var(--nx-muted)" }}>
              {classificationLabel(value)}
            </span>
          </div>
        ))}
      </div>
      {total === 0 ? (
        <p style={{ marginTop: 7, fontSize: 10.5, lineHeight: 1.5, color: "var(--nx-muted)", maxWidth: 260 }}>
          Cliquem em uma pessoa ou em uma ligação no grafo e classifiquem. É assim que a equipe
          separa o que já explicou do que ainda incomoda.
        </p>
      ) : null}
    </div>
  );
}
