import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import type { Node as NvlNode, Relationship as NvlRelationship } from "@neo4j-nvl/base";
import { useGraphStore, useTeamGraphPayload } from "./graphStore";
import { colorForLabels, primaryLabel } from "./colors";
import { forceLayout } from "./layout";

interface NvlWrapperProps {
  nodes: NvlNode[];
  rels: NvlRelationship[];
  nvlOptions?: {
    renderer?: "canvas" | "webgl";
    layout?: string;
    initialZoom?: number;
  };
  mouseEventCallbacks?: {
    onNodeClick?: (node: NvlNode) => void;
  };
  onInitializationError?: (error: unknown) => void;
}

export function GraphCanvas() {
  const payload = useTeamGraphPayload();
  const recentIds = useGraphStore((s) => s.recentIds);
  const selectedId = useGraphStore((s) => s.selectedId);
  const [nvlFailed, setNvlFailed] = useState(() => import.meta.env.MODE === "test");
  const [Nvl, setNvl] = useState<ComponentType<NvlWrapperProps> | null>(null);

  useEffect(() => {
    if (nvlFailed) return;
    let cancelled = false;
    void import("@neo4j-nvl/react")
      .then((mod) => {
        if (!cancelled) setNvl(() => mod.InteractiveNvlWrapper as unknown as ComponentType<NvlWrapperProps>);
      })
      .catch(() => {
        if (!cancelled) setNvlFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [nvlFailed]);

  const nvlNodes: NvlNode[] = useMemo(
    () =>
      payload.nodes.map((node) => ({
        id: node.id,
        caption: node.label_display,
        color: recentIds.includes(node.id) ? "#3ee0a0" : colorForLabels(node.labels),
        size: recentIds.includes(node.id) ? 28 : selectedId === node.id ? 26 : 22,
        selected: selectedId === node.id,
      })),
    [payload.nodes, recentIds, selectedId],
  );

  const nvlRels: NvlRelationship[] = useMemo(
    () =>
      payload.relationships.map((rel) => ({
        id: rel.id,
        from: rel.start_id,
        to: rel.end_id,
        caption: rel.type,
        color: recentIds.includes(rel.id) ? "#3ee0a0" : "#4a5d78",
        width: recentIds.includes(rel.id) ? 2.4 : 1.2,
      })),
    [payload.relationships, recentIds],
  );

  if (payload.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <p className="max-w-sm text-sm leading-relaxed text-nexus-muted">
          Grafo vazio. Abra um dossiê à esquerda — individualmente, tudo parece normal.
          As relações é que vão doer.
        </p>
      </div>
    );
  }

  if (!nvlFailed && Nvl) {
    return (
      <div className="relative h-full min-h-0 w-full">
        <Nvl
          nodes={nvlNodes}
          rels={nvlRels}
          nvlOptions={{ renderer: "canvas", layout: "forceDirected", initialZoom: 1 }}
          mouseEventCallbacks={{
            onNodeClick: (node) => useGraphStore.getState().select(node.id),
          }}
          onInitializationError={() => setNvlFailed(true)}
        />
      </div>
    );
  }

  return <SvgGraph />;
}

function SvgGraph() {
  const payload = useTeamGraphPayload();
  const recentIds = useGraphStore((s) => s.recentIds);
  const selectedId = useGraphStore((s) => s.selectedId);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 420 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ w: Math.max(320, entry.contentRect.width), h: Math.max(240, entry.contentRect.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const positions = useMemo(
    () => forceLayout(
      payload.nodes.map((n) => n.id),
      payload.relationships,
      size.w,
      size.h,
    ),
    [payload.nodes, payload.relationships, size.h, size.w],
  );

  return (
    <div ref={wrapRef} className="h-full w-full">
      <svg viewBox={`0 0 ${size.w} ${size.h}`} className="h-full w-full" role="img" aria-label="Grafo da investigação">
        <defs>
          <marker id="nx-arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#4a5d78" />
          </marker>
        </defs>
        {payload.relationships.map((rel) => {
          const from = positions.get(rel.start_id);
          const to = positions.get(rel.end_id);
          if (!from || !to) return null;
          const pulse = recentIds.includes(rel.id);
          return (
            <g key={rel.id}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={pulse ? "#3ee0a0" : "#4a5d78"}
                strokeWidth={pulse ? 2.2 : 1.2}
                markerEnd="url(#nx-arrow)"
              />
              <text
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2 - 6}
                textAnchor="middle"
                fill="#8b9bb4"
                fontSize="9"
                fontFamily="IBM Plex Mono, ui-monospace, monospace"
              >
                {rel.type}
              </text>
            </g>
          );
        })}
        {payload.nodes.map((node) => {
          const p = positions.get(node.id);
          if (!p) return null;
          const color = colorForLabels(node.labels);
          const pulse = recentIds.includes(node.id);
          const selected = selectedId === node.id;
          return (
            <g
              key={node.id}
              transform={`translate(${p.x}, ${p.y})`}
              className={pulse ? "nexus-node-pulse" : undefined}
              style={{ cursor: "pointer" }}
              onClick={() => useGraphStore.getState().select(node.id)}
            >
              <circle
                r={selected ? 22 : 18}
                fill="#0c1018"
                stroke={pulse ? "#3ee0a0" : color}
                strokeWidth={selected || pulse ? 3 : 2}
              />
              <text
                textAnchor="middle"
                y={4}
                fill={color}
                fontSize="9"
                fontFamily="IBM Plex Sans, sans-serif"
                fontWeight={600}
              >
                {primaryLabel(node.labels).slice(0, 3).toUpperCase()}
              </text>
              <text
                textAnchor="middle"
                y={34}
                fill="#e8eef8"
                fontSize="11"
                fontFamily="IBM Plex Sans, sans-serif"
              >
                {node.label_display}
              </text>
              <text
                textAnchor="middle"
                y={48}
                fill="#8b9bb4"
                fontSize="9"
                fontFamily="IBM Plex Mono, ui-monospace, monospace"
              >
                {node.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
