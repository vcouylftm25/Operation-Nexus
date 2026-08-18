import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { GraphNode, GraphRelationship } from "@/lib/types";
import { propertyText } from "@/lib/utils";
import { labelDisplay, relationshipDisplay } from "./colors";
import { useGraphStore, useTeamGraphPayload } from "./graphStore";
import { extractEventTimestamp, isMoneyRelationship, shapeD, visualFor } from "./nodeVisuals";
import { useNxThemeStore } from "./nxTheme";

interface Pos {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pin: boolean;
  fx?: number;
  fy?: number;
}

interface Camera {
  x: number;
  y: number;
  k: number;
}

type Mode = "network" | "money" | "timeline";

interface GraphCanvasProps {
  onCommand: (command: string) => void;
  pending?: boolean;
}

const LINK_DISTANCE = 150;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.6;

function bfsPath(
  from: string,
  to: string,
  relationships: GraphRelationship[],
): { nodes: string[]; edges: string[] } | null {
  if (from === to) return { nodes: [from], edges: [] };
  const prev = new Map<string, { node: string; edge: string }>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    if (current === to) break;
    for (const rel of relationships) {
      const next = rel.start_id === current ? rel.end_id : rel.end_id === current ? rel.start_id : null;
      if (!next || seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { node: current, edge: rel.id });
      queue.push(next);
    }
  }
  if (!seen.has(to)) return null;
  const nodes = [to];
  const edges: string[] = [];
  let cur = to;
  while (prev.has(cur)) {
    const step = prev.get(cur);
    if (!step) break;
    edges.unshift(step.edge);
    cur = step.node;
    nodes.unshift(cur);
  }
  return { nodes, edges };
}

function formatTimelineDate(ts: string): string {
  return ts.replace("T", " ").replace(/Z$/, "").toUpperCase();
}

function parseTs(ts: string): number {
  const t = Date.parse(ts);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export function GraphCanvas({ onCommand, pending }: GraphCanvasProps) {
  const payload = useTeamGraphPayload();
  const recentIds = useGraphStore((s) => s.recentIds);
  const selectedIds = useGraphStore((s) => s.selectedIds);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const toggleSelect = useGraphStore((s) => s.toggleSelect);
  const selectEdge = useGraphStore((s) => s.selectEdge);
  const clearSelection = useGraphStore((s) => s.select);
  const theme = useNxThemeStore((s) => s.theme);
  const toggleTheme = useNxThemeStore((s) => s.toggle);

  const wrapRef = useRef<HTMLDivElement>(null);
  // Mutable working copies the physics loop and pointer handlers write to.
  // Never read directly during render — `positions`/`cam` state below is the
  // published snapshot the JSX actually renders from.
  const posRef = useRef<Record<string, Pos>>({});
  const camRef = useRef<Camera>({ x: 0, y: 0, k: 1 });
  const camAnimRef = useRef<{ t0: number; from: Camera; to: Camera } | null>(null);
  const dragRef = useRef<{ id: string; x0: number; y0: number; px: number; py: number; s: number; moved: boolean } | null>(
    null,
  );
  const panRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const rafRef = useRef<number>(0);
  const pendingPathRef = useRef<[string, string] | null>(null);

  const [size, setSize] = useState({ w: 640, h: 420 });
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, k: 1 });
  const [panning, setPanning] = useState(false);
  const [mode, setMode] = useState<Mode>("network");
  const [search, setSearch] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [path, setPath] = useState<{ nodes: string[]; edges: string[] } | null>(null);

  function publishPositions() {
    setPositions({ ...posRef.current });
  }

  function publishCam() {
    setCam({ ...camRef.current });
  }

  const nodesById = useMemo(() => new Map(payload.nodes.map((n) => [n.id, n])), [payload.nodes]);

  function neighborsOf(id: string): string[] {
    const out: string[] = [];
    payload.relationships.forEach((r) => {
      if (r.start_id === id) out.push(r.end_id);
      else if (r.end_id === id) out.push(r.start_id);
    });
    return out;
  }

  function fitTo(ids: string[]) {
    const pts = ids.map((id) => posRef.current[id]).filter((p): p is Pos => !!p);
    if (!pts.length) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs) - 90;
    const maxX = Math.max(...xs) + 90;
    const minY = Math.min(...ys) - 90;
    const maxY = Math.max(...ys) + 90;
    const k = Math.max(0.55, Math.min(1.9, Math.min(size.w / (maxX - minX || 1), size.h / (maxY - minY || 1))));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    camAnimRef.current = {
      t0: performance.now(),
      from: { ...camRef.current },
      to: { k, x: size.w / 2 - cx * k, y: size.h / 2 - cy * k },
    };
  }

  // Resize observer.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(320, entry.contentRect.width);
      const h = Math.max(240, entry.contentRect.height);
      setSize((prev) => (Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Seed positions for newly-discovered nodes, near whatever is selected.
  useEffect(() => {
    let added = false;
    payload.nodes.forEach((node, i) => {
      if (posRef.current[node.id]) return;
      added = true;
      const origin = selectedIds[0] && posRef.current[selectedIds[0]] ? posRef.current[selectedIds[0]] : null;
      const cx = origin?.x ?? size.w / 2;
      const cy = origin?.y ?? size.h / 2;
      const angle = (i / Math.max(1, payload.nodes.length)) * Math.PI * 2 + i;
      const spread = origin ? 45 : Math.min(size.w, size.h) * 0.32;
      posRef.current[node.id] = {
        x: cx + Math.cos(angle) * spread,
        y: cy + Math.sin(angle) * spread,
        vx: 0,
        vy: 0,
        pin: false,
      };
    });
    if (added) {
      publishPositions();
      window.setTimeout(() => fitTo(payload.nodes.map((n) => n.id)), 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.nodes]);

  // Clear the "recently discovered" pulse a couple seconds after it lands.
  useEffect(() => {
    if (recentIds.length === 0) return;
    const t = setTimeout(() => useGraphStore.getState().clearRecent(), 2200);
    return () => clearTimeout(t);
  }, [recentIds]);

  // Once a /path command's result merges in, resolve the ordered hop list.
  useEffect(() => {
    if (!pendingPathRef.current) return;
    const [a, b] = pendingPathRef.current;
    const found = bfsPath(a, b, payload.relationships);
    if (found) {
      setPath(found);
      pendingPathRef.current = null;
    }
  }, [payload.relationships]);

  useEffect(() => {
    if (selectedIds.length < 2) pendingPathRef.current = null;
  }, [selectedIds]);

  // Escape clears every transient selection state.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      clearSelection(null);
      setFocus(null);
      setPath(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection]);

  // Physics + camera animation loop. Reads/writes posRef/camRef freely (this
  // effect callback is the sanctioned place for that) and only touches React
  // state to publish a snapshot for rendering.
  useEffect(() => {
    function step() {
      const ids = payload.nodes.map((n) => n.id).filter((id) => posRef.current[id]);
      const rels = payload.relationships;
      ids.forEach((a) => {
        const pa = posRef.current[a];
        let fx = (size.w / 2 - pa.x) * 0.01;
        let fy = (size.h / 2 - pa.y) * 0.012;
        ids.forEach((b) => {
          if (a === b) return;
          const pb = posRef.current[b];
          let dx = pa.x - pb.x;
          let dy = pa.y - pb.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 4) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            d2 = 4;
          }
          if (d2 > 260000) return;
          const d = Math.sqrt(d2);
          const f = Math.min(3.2, 34000 / d2);
          fx += (dx / d) * f;
          fy += (dy / d) * f;
        });
        pa.fx = fx;
        pa.fy = fy;
      });
      rels.forEach((rel) => {
        const pa = posRef.current[rel.start_id];
        const pb = posRef.current[rel.end_id];
        if (!pa || !pb) return;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const f = (d - LINK_DISTANCE) * 0.016;
        const ux = dx / d;
        const uy = dy / d;
        pa.fx = (pa.fx ?? 0) + ux * f;
        pa.fy = (pa.fy ?? 0) + uy * f;
        pb.fx = (pb.fx ?? 0) - ux * f;
        pb.fy = (pb.fy ?? 0) - uy * f;
      });
      let moved = 0;
      ids.forEach((id) => {
        const p = posRef.current[id];
        if (p.pin || dragRef.current?.id === id) {
          p.vx = 0;
          p.vy = 0;
          return;
        }
        p.vx = (p.vx + (p.fx ?? 0) * 0.55) * 0.8;
        p.vy = (p.vy + (p.fy ?? 0) * 0.55) * 0.8;
        p.vx = Math.max(-9, Math.min(9, p.vx));
        p.vy = Math.max(-9, Math.min(9, p.vy));
        p.x += p.vx;
        p.y += p.vy;
        moved += Math.abs(p.vx) + Math.abs(p.vy);
      });
      let camMoved = false;
      if (camAnimRef.current) {
        const a = camAnimRef.current;
        const t = Math.min(1, (performance.now() - a.t0) / 460);
        const e = 1 - (1 - t) ** 3;
        camRef.current = {
          x: a.from.x + (a.to.x - a.from.x) * e,
          y: a.from.y + (a.to.y - a.from.y) * e,
          k: a.from.k + (a.to.k - a.from.k) * e,
        };
        camMoved = true;
        if (t >= 1) camAnimRef.current = null;
      }
      if (moved > 0.25 || dragRef.current || panRef.current) {
        publishPositions();
      }
      if (camMoved || panRef.current) {
        publishCam();
      }
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [payload.nodes, payload.relationships, size.h, size.w]);

  function onWheel(ev: ReactWheelEvent<SVGSVGElement>) {
    ev.preventDefault();
    const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camRef.current.k * (ev.deltaY > 0 ? 0.9 : 1.11)));
    const rect = ev.currentTarget.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const wx = (mx - camRef.current.x) / camRef.current.k;
    const wy = (my - camRef.current.y) / camRef.current.k;
    camRef.current = { k, x: mx - wx * k, y: my - wy * k };
    publishCam();
  }

  function onBgPointerDown(ev: ReactPointerEvent<SVGElement>) {
    const tag = (ev.target as SVGElement).tagName;
    if (tag !== "rect" && tag !== "svg") return;
    const startCam = { ...camRef.current };
    panRef.current = { x: ev.clientX, y: ev.clientY, cx: startCam.x, cy: startCam.y };
    setPanning(true);
    function move(e: PointerEvent) {
      if (!panRef.current) return;
      camRef.current = {
        ...camRef.current,
        x: panRef.current.cx + (e.clientX - panRef.current.x),
        y: panRef.current.cy + (e.clientY - panRef.current.y),
      };
    }
    function up() {
      panRef.current = null;
      setPanning(false);
      publishCam();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startDrag(id: string, ev: ReactPointerEvent<SVGGElement>) {
    ev.stopPropagation();
    const p = posRef.current[id];
    if (!p) return;
    const s = 1 / camRef.current.k;
    dragRef.current = { id, x0: ev.clientX, y0: ev.clientY, px: p.x, py: p.y, s, moved: false };
    function move(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.x0) * d.s;
      const dy = (e.clientY - d.y0) * d.s;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      const pos = posRef.current[id];
      if (!pos) return;
      pos.x = d.px + dx;
      pos.y = d.py + dy;
      pos.vx = 0;
      pos.vy = 0;
    }
    function up(e: PointerEvent) {
      const d = dragRef.current;
      if (d) {
        if (d.moved) {
          const pos = posRef.current[id];
          if (pos) pos.pin = true;
        } else {
          toggleSelect(id, e.shiftKey);
        }
      }
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      publishPositions();
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function handleFit() {
    fitTo(payload.nodes.map((n) => n.id));
  }

  function handleZoomOut() {
    camRef.current = { ...camRef.current, k: Math.max(MIN_ZOOM, camRef.current.k * 0.88) };
    publishCam();
  }

  function handleZoomIn() {
    camRef.current = { ...camRef.current, k: Math.min(MAX_ZOOM, camRef.current.k * 1.14) };
    publishCam();
  }

  function handleUnpinOrExitFocus() {
    if (focus) {
      setFocus(null);
      return;
    }
    Object.values(posRef.current).forEach((p) => {
      p.pin = false;
    });
    publishPositions();
  }

  function handleTogglePin(id: string) {
    const p = posRef.current[id];
    if (!p) return;
    p.pin = !p.pin;
    publishPositions();
  }

  function runSearch() {
    const q = search.trim().toLowerCase();
    if (!q) return;
    const hit = payload.nodes.find((n) => n.label_display.toLowerCase().includes(q));
    if (hit) {
      toggleSelect(hit.id, false);
      fitTo([hit.id, ...neighborsOf(hit.id)]);
    }
  }

  function requestShared() {
    if (selectedIds.length < 2) return;
    onCommand(`/shared ${selectedIds[0]},${selectedIds[1]}`);
  }

  function requestPath() {
    if (selectedIds.length < 2) return;
    const [a, b] = selectedIds;
    const existing = bfsPath(a, b, payload.relationships);
    if (existing) {
      setPath(existing);
      return;
    }
    pendingPathRef.current = [a, b];
    onCommand(`/path ${a} ${b}`);
  }

  const moneyEdges = useMemo(
    () => payload.relationships.filter((r) => isMoneyRelationship(r.type)),
    [payload.relationships],
  );
  const moneyIds = useMemo(() => {
    const set = new Set<string>();
    moneyEdges.forEach((r) => {
      set.add(r.start_id);
      set.add(r.end_id);
    });
    return set;
  }, [moneyEdges]);
  const moneyMode = mode === "money";
  const moneyEmpty = moneyMode && moneyEdges.length === 0;

  const timelineEvents = useMemo(() => {
    return payload.relationships
      .map((rel) => ({ rel, ts: extractEventTimestamp(rel.properties) }))
      .filter((e): e is { rel: GraphRelationship; ts: string } => !!e.ts)
      .sort((a, b) => parseTs(a.ts) - parseTs(b.ts));
  }, [payload.relationships]);

  const halo = useMemo(() => {
    if (selectedIds.length === 0) return null;
    const set = new Set(selectedIds);
    selectedIds.forEach((id) => neighborsOf(id).forEach((n) => set.add(n)));
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, payload.relationships]);

  const sharedIds = useMemo(() => {
    if (selectedIds.length < 2) return new Set<string>();
    const sets = selectedIds.map((id) => new Set(neighborsOf(id)));
    const [first, ...rest] = sets;
    const shared = [...first].filter((id) => rest.every((s) => s.has(id)) && !selectedIds.includes(id));
    return new Set(shared);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, payload.relationships]);

  function nodeOpacity(id: string): number {
    if (path) return path.nodes.includes(id) ? 1 : 0.15;
    if (focus) return id === focus || neighborsOf(focus).includes(id) ? 1 : 0.06;
    if (halo) return halo.has(id) || sharedIds.has(id) ? 1 : 0.35;
    if (moneyMode) return moneyIds.has(id) ? 1 : 0.18;
    if (hover) return hover === id || neighborsOf(hover).includes(id) ? 1 : 0.35;
    return 1;
  }

  function edgeOpacity(rel: GraphRelationship): number {
    if (path) return path.edges.includes(rel.id) ? 1 : 0.1;
    if (focus) {
      const f = new Set([focus, ...neighborsOf(focus)]);
      return f.has(rel.start_id) && f.has(rel.end_id) ? 1 : 0.05;
    }
    if (halo) return halo.has(rel.start_id) && halo.has(rel.end_id) ? 1 : 0.12;
    if (moneyMode) return isMoneyRelationship(rel.type) ? 1 : 0.08;
    if (hover) return rel.start_id === hover || rel.end_id === hover ? 1 : 0.22;
    return 1;
  }

  const camTransform = `translate(${cam.x.toFixed(2)},${cam.y.toFixed(2)}) scale(${cam.k.toFixed(3)})`;

  const selectedNode = selectedIds.length === 1 ? (nodesById.get(selectedIds[0]) ?? null) : null;
  const selectedRel = selectedEdgeId ? payload.relationships.find((r) => r.id === selectedEdgeId) ?? null : null;

  if (payload.nodes.length === 0) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 32px", textAlign: "center" }}>
        <p style={{ maxWidth: 380, fontSize: 13, lineHeight: 1.6, color: "var(--nx-muted)" }}>
          Grafo vazio. Abra um dossiê à esquerda — individualmente, tudo parece normal. As relações é que vão doer.
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: "var(--nx-card)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "9px 14px",
          borderBottom: "1px solid var(--nx-line)",
          background: "var(--nx-card)",
        }}
      >
        <div style={{ display: "flex", gap: 3, padding: 3, border: "1px solid var(--nx-line)", borderRadius: 10, background: "var(--nx-elev)" }}>
          {(
            [
              ["network", "NETWORK"],
              ["money", "MONEY FLOW"],
              ["timeline", "TIMELINE"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              style={{
                padding: "6px 13px",
                borderRadius: 7,
                cursor: "pointer",
                border: "none",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.14em",
                background: mode === key ? "var(--nx-accent-text)" : "transparent",
                color: mode === key ? "var(--nx-on-accent)" : "var(--nx-muted)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", border: "1px solid var(--nx-line-2)", borderRadius: 8, background: "var(--nx-card)" }}>
            <span style={{ fontSize: 11, color: "var(--nx-muted)" }}>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Buscar entidade"
              style={{ width: 140, border: "none", outline: "none", background: "transparent", color: "var(--nx-ink)", fontSize: 11.5 }}
            />
          </div>
          <button type="button" onClick={handleFit} style={toolButtonStyle}>
            FIT
          </button>
          <button type="button" onClick={handleZoomOut} style={toolButtonStyle}>
            −
          </button>
          <button type="button" onClick={handleZoomIn} style={toolButtonStyle}>
            +
          </button>
          <button type="button" onClick={handleUnpinOrExitFocus} style={toolButtonStyle}>
            {focus ? "← REDE COMPLETA" : "SOLTAR PINS"}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "dark" ? "Tema claro" : "Tema escuro"}
            style={{
              width: 28,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--nx-line-2)",
              borderRadius: 8,
              cursor: "pointer",
              background: "transparent",
              color: "var(--nx-muted)",
              fontSize: 12,
            }}
          >
            {theme === "dark" ? "☾" : "☀"}
          </button>
        </div>
      </div>

      <div ref={wrapRef} style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <svg
          onWheel={onWheel}
          onPointerDown={onBgPointerDown}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: panning ? "grabbing" : "grab", touchAction: "none", display: "block" }}
        >
          <rect x={0} y={0} width="100%" height="100%" style={{ fill: "var(--nx-canvas)" }} />
          <rect x={0} y={0} width="100%" height="100%" fill="url(#nxGrid)" opacity={0.75} />
          <defs>
            <pattern id="nxGrid" width={34} height={34} patternUnits="userSpaceOnUse">
              <circle cx={1} cy={1} r={1} style={{ fill: "var(--nx-grid)" }} />
            </pattern>
          </defs>
          <g transform={camTransform}>
            {payload.relationships.map((rel) => {
              const pa = positions[rel.start_id];
              const pb = positions[rel.end_id];
              if (!pa || !pb) return null;
              const ra = visualFor(nodesById.get(rel.start_id)?.labels ?? []).r + 4;
              const rb = visualFor(nodesById.get(rel.end_id)?.labels ?? []).r + 4;
              const dx = pb.x - pa.x;
              const dy = pb.y - pa.y;
              const d = Math.max(1, Math.hypot(dx, dy));
              const ux = dx / d;
              const uy = dy / d;
              const x1 = pa.x + ux * ra;
              const y1 = pa.y + uy * ra;
              const x2 = pb.x - ux * rb;
              const y2 = pb.y - uy * rb;
              const selectedThisEdge = selectedEdgeId === rel.id;
              const inPath = path?.edges.includes(rel.id) ?? false;
              const isRecent = recentIds.includes(rel.id);
              const money = isMoneyRelationship(rel.type);
              let color = "var(--nx-edge)";
              let width = 1.1;
              if (moneyMode && money) {
                color = "var(--nx-accent)";
                width = 2;
              }
              if (inPath) {
                color = "var(--nx-accent)";
                width = 2.2;
              }
              if (selectedThisEdge) {
                color = "var(--nx-accent)";
                width = 2;
              }
              const opacity = edgeOpacity(rel);
              const ah = 7;
              const arrow = `M ${x2},${y2} L ${x2 - ux * ah - uy * ah * 0.55},${y2 - uy * ah + ux * ah * 0.55} L ${x2 - ux * ah + uy * ah * 0.55},${y2 - uy * ah - ux * ah * 0.55} Z`;
              const label = moneyMode && money && typeof rel.properties.amount === "string" ? rel.properties.amount : relationshipDisplay(rel.type);
              return (
                <g key={rel.id} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); selectEdge(rel.id); }}>
                  <path d={`M ${x1.toFixed(1)},${y1.toFixed(1)} L ${x2.toFixed(1)},${y2.toFixed(1)}`} style={{ stroke: "transparent", strokeWidth: 14, fill: "none" }} />
                  <path
                    d={`M ${x1.toFixed(1)},${y1.toFixed(1)} L ${x2.toFixed(1)},${y2.toFixed(1)}`}
                    style={{
                      stroke: color,
                      strokeWidth: width,
                      fill: "none",
                      opacity,
                      strokeDasharray: isRecent ? 240 : undefined,
                      strokeDashoffset: isRecent ? 240 : 0,
                      animation: isRecent ? "nxDraw 520ms cubic-bezier(.22,1,.36,1) forwards" : undefined,
                    }}
                  />
                  <path d={arrow} style={{ fill: color, opacity }} />
                  <title>{label}</title>
                </g>
              );
            })}
            {payload.nodes.map((node) => {
              const p = positions[node.id];
              if (!p) return null;
              const visual = visualFor(node.labels);
              const selected = selectedIds.includes(node.id);
              const isRecent = recentIds.includes(node.id);
              const opacity = nodeOpacity(node.id);
              const isz = visual.r * 0.048;
              return (
                <g
                  key={node.id}
                  transform={`translate(${p.x.toFixed(2)},${p.y.toFixed(2)})`}
                  style={{ cursor: "pointer", opacity, animation: isRecent ? "nxPulse 620ms cubic-bezier(.22,1,.36,1)" : undefined }}
                  onPointerDown={(e) => startDrag(node.id, e)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => { e.stopPropagation(); onCommand(`/expand ${node.id} 1`); }}
                  onPointerEnter={() => setHover(node.id)}
                  onPointerLeave={() => setHover((h) => (h === node.id ? null : h))}
                >
                  {isRecent ? <circle cx={0} cy={0} r={14} style={{ fill: "none", stroke: "var(--nx-accent)", strokeWidth: 1, animation: "nxHalo 1.4s ease-out" }} /> : null}
                  {selected ? <path d={shapeD(visual.shape, visual.r + 6)} style={{ fill: "none", stroke: "var(--nx-accent-35)", strokeWidth: 1 }} /> : null}
                  <path d={shapeD(visual.shape, visual.r)} style={{ fill: "var(--nx-node-fill)", stroke: selected ? "var(--nx-accent)" : "var(--nx-node-stroke)", strokeWidth: selected ? 1.8 : 1.2 }} />
                  <g transform={`translate(${(-12 * isz).toFixed(2)},${(-12 * isz).toFixed(2)}) scale(${isz.toFixed(3)})`}>
                    <path d={visual.icon[0]} style={{ fill: "none", stroke: selected ? "var(--nx-accent)" : "var(--nx-muted)", strokeWidth: 1.5 / isz, strokeLinecap: "round", strokeLinejoin: "round", pointerEvents: "none" }} />
                    {visual.icon[1] ? (
                      <path d={visual.icon[1]} style={{ fill: "none", stroke: selected ? "var(--nx-accent)" : "var(--nx-muted)", strokeWidth: 1.5 / isz, strokeLinecap: "round", strokeLinejoin: "round", pointerEvents: "none" }} />
                    ) : null}
                  </g>
                </g>
              );
            })}
          </g>
        </svg>

        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
          {payload.nodes.map((node) => {
            const p = positions[node.id];
            if (!p) return null;
            const sx = cam.x + p.x * cam.k;
            const sy = cam.y + p.y * cam.k;
            const visual = visualFor(node.labels);
            const opacity = nodeOpacity(node.id);
            return (
              <div key={node.id} style={{ position: "absolute", left: sx, top: sy, transform: "translate(-50%,-50%)", width: 150, textAlign: "center", opacity, transition: "opacity 180ms" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: visual.r * cam.k + 8,
                    fontSize: 12.5 * Math.min(1.3, Math.max(0.8, cam.k)),
                    fontWeight: 500,
                    color: "var(--nx-ink)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {node.label_display}
                </div>
                {p.pin ? (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: visual.r * cam.k + 26,
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: "var(--nx-accent-text)",
                    }}
                  >
                    FIXADO
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div
          style={{
            position: "absolute",
            left: 14,
            bottom: 14,
            zIndex: 3,
            pointerEvents: "none",
            display: mode === "timeline" || selectedNode || selectedRel ? "none" : "flex",
            flexDirection: "column",
            gap: 5,
            padding: "10px 12px",
            border: "1px solid var(--nx-line)",
            borderRadius: 10,
            background: "var(--nx-glass)",
          }}
        >
          {(["Person", "Device", "BankAccount", "Company"] as const).map((label) => {
            const v = visualFor([label]);
            return (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, flexShrink: 0, fill: "none", stroke: "var(--nx-muted)", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d={v.icon[0]} />
                  {v.icon[1] ? <path d={v.icon[1]} /> : null}
                </svg>
                <span style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--nx-muted)" }}>{labelDisplay([label]).toUpperCase()}</span>
              </div>
            );
          })}
        </div>

        {moneyEmpty ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: 290,
              padding: 18,
              border: "1px solid var(--nx-accent-28)",
              borderRadius: 16,
              background: "var(--nx-card)",
              textAlign: "center",
              animation: "nxRise .28s cubic-bezier(.22,1,.36,1)",
            }}
          >
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: "var(--nx-accent-text)" }}>MONEY FLOW</div>
            <div style={{ fontSize: 12.5, color: "var(--nx-ink)", lineHeight: 1.55, marginTop: 9 }}>
              Nenhum rastro financeiro descoberto ainda. Expanda pessoas e contas para revelar transferências.
            </div>
            <button
              type="button"
              onClick={() => setMode("network")}
              style={{
                marginTop: 14,
                padding: "8px 12px",
                border: "1px solid var(--nx-accent-35)",
                borderRadius: 9,
                cursor: "pointer",
                background: "transparent",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.12em",
                color: "var(--nx-accent-text)",
              }}
            >
              ← VOLTAR PARA NETWORK
            </button>
          </div>
        ) : null}

        {path ? (
          <div
            style={{
              position: "absolute",
              right: 14,
              top: 14,
              width: 260,
              padding: 14,
              border: "1px solid var(--nx-accent-35)",
              borderRadius: 16,
              background: "var(--nx-card)",
              animation: "nxRise .32s cubic-bezier(.22,1,.36,1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: "var(--nx-accent-text)" }}>
                {path.edges.length}-HOP PATH
              </span>
              <span onClick={() => setPath(null)} style={{ cursor: "pointer", fontSize: 11, color: "var(--nx-muted)" }}>
                ✕
              </span>
            </div>
            <div style={{ marginTop: 11, display: "flex", flexDirection: "column" }}>
              {path.nodes.map((id, i) => (
                <div key={id}>
                  <div style={{ fontSize: 12.5, color: "var(--nx-ink)" }}>{nodesById.get(id)?.label_display ?? id}</div>
                  {i < path.edges.length ? (
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "var(--nx-muted)", padding: "3px 0 3px 2px" }}>
                      ↓ {relationshipDisplay(payload.relationships.find((r) => r.id === path.edges[i])?.type ?? "")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {selectedIds.length >= 2 ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 16,
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px",
              border: "1px solid var(--nx-line-2)",
              borderRadius: 16,
              background: "var(--nx-card)",
              animation: "nxRise .24s cubic-bezier(.22,1,.36,1)",
            }}
          >
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: "var(--nx-accent-text)" }}>
              {selectedIds.length} ENTIDADES SELECIONADAS
            </span>
            <div style={{ width: 1, height: 18, background: "var(--nx-line-2)" }} />
            <button type="button" disabled={pending} onClick={requestShared} style={quickActionStyle}>
              Conexões em comum
            </button>
            <button type="button" disabled={pending} onClick={requestPath} style={quickActionStyle}>
              Encontrar caminho
            </button>
          </div>
        ) : null}

        {selectedNode || selectedRel ? (
          <Inspector
            node={selectedNode}
            rel={selectedRel}
            nodesById={nodesById}
            pinned={selectedNode ? !!positions[selectedNode.id]?.pin : false}
            focused={focus === selectedNode?.id}
            onFocusToggle={() => selectedNode && setFocus((f) => (f === selectedNode.id ? null : selectedNode.id))}
            onTogglePin={() => selectedNode && handleTogglePin(selectedNode.id)}
            onExpand={(id) => onCommand(`/expand ${id} 1`)}
            onTimeline={(id) => { onCommand(`/timeline ${id}`); setMode("timeline"); }}
            onClose={() => clearSelection(null)}
          />
        ) : null}
      </div>

      {mode === "timeline" ? (
        <div style={{ flexShrink: 0, padding: "14px 16px 16px", borderTop: "1px solid var(--nx-line)", background: "var(--nx-card)" }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: "var(--nx-muted)" }}>
            LINHA DO TEMPO · EVENTOS DESCOBERTOS
          </span>
          <div style={{ display: "flex", gap: 0, marginTop: 12, overflowX: "auto" }}>
            {timelineEvents.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--nx-muted)" }}>Nenhum evento com data descoberto ainda.</p>
            ) : (
              timelineEvents.map(({ rel, ts }) => (
                <div
                  key={rel.id}
                  onClick={() => { selectEdge(rel.id); setMode("network"); }}
                  style={{ minWidth: 150, padding: "0 14px 2px", borderLeft: "1px solid var(--nx-line-2)", cursor: "pointer" }}
                >
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em", color: "var(--nx-muted)" }}>
                    {formatTimelineDate(ts)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--nx-ink)", marginTop: 5 }}>{relationshipDisplay(rel.type)}</div>
                  <div style={{ fontSize: 10.5, color: "var(--nx-muted)", marginTop: 3 }}>
                    {nodesById.get(rel.start_id)?.label_display ?? rel.start_id} → {nodesById.get(rel.end_id)?.label_display ?? rel.end_id}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const toolButtonStyle = {
  padding: "6px 10px",
  border: "1px solid var(--nx-line-2)",
  borderRadius: 8,
  cursor: "pointer",
  background: "transparent",
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 10,
  letterSpacing: "0.1em",
  color: "var(--nx-muted)",
} as const;

const quickActionStyle = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "6px 10px",
  border: "1px solid var(--nx-line-2)",
  borderRadius: 8,
  cursor: "pointer",
  background: "transparent",
  fontSize: 11.5,
  color: "var(--nx-ink)",
} as const;

interface InspectorProps {
  node: GraphNode | null;
  rel: GraphRelationship | null;
  nodesById: Map<string, GraphNode>;
  pinned: boolean;
  focused: boolean;
  onFocusToggle: () => void;
  onTogglePin: () => void;
  onExpand: (id: string) => void;
  onTimeline: (id: string) => void;
  onClose: () => void;
}

function Inspector({ node, rel, nodesById, pinned, focused, onFocusToggle, onTogglePin, onExpand, onTimeline, onClose }: InspectorProps) {
  const rows: [string, string][] = [];
  let title = "";
  let sub = "";

  if (node) {
    title = node.label_display;
    sub = labelDisplay(node.labels);
    Object.entries(node.properties).forEach(([key, value]) => rows.push([key.replaceAll("_", " "), propertyText(value)]));
  } else if (rel) {
    const start = nodesById.get(rel.start_id);
    const end = nodesById.get(rel.end_id);
    title = relationshipDisplay(rel.type);
    sub = `${start?.label_display ?? rel.start_id} → ${end?.label_display ?? rel.end_id}`;
    Object.entries(rel.properties).forEach(([key, value]) => rows.push([key.replaceAll("_", " "), propertyText(value)]));
  }

  return (
    <div
      style={{
        position: "absolute",
        left: 14,
        bottom: 14,
        maxWidth: 320,
        padding: 16,
        border: "1px solid var(--nx-line-2)",
        borderRadius: 16,
        background: "var(--nx-glass)",
        backdropFilter: "blur(6px)",
        animation: "nxRise .28s cubic-bezier(.22,1,.36,1)",
        zIndex: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: "var(--nx-muted)" }}>
          {node ? "ENTIDADE" : "RELAÇÃO"}
        </span>
        <span onClick={onClose} style={{ cursor: "pointer", fontSize: 11, color: "var(--nx-muted)" }}>
          FECHAR ✕
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 500, marginTop: 6, color: "var(--nx-ink)" }}>{title}</div>
      <div style={{ fontSize: 11.5, color: "var(--nx-muted)", marginTop: 3 }}>{sub}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 12, maxHeight: 140, overflowY: "auto" }}>
        {rows.slice(0, 8).map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--nx-accent-06)" }}>
            <span style={{ fontSize: 10.5, letterSpacing: "0.08em", color: "var(--nx-muted)", textTransform: "uppercase" }}>{k}</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--nx-ink)", textAlign: "right" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        {node ? (
          <>
            <button type="button" onClick={() => onExpand(node.id)} style={quickActionStyle}>
              Expandir conexões
            </button>
            <button type="button" onClick={() => onTimeline(node.id)} style={quickActionStyle}>
              Ver linha do tempo
            </button>
            <button type="button" onClick={onFocusToggle} style={quickActionStyle}>
              {focused ? "Sair do focus" : "Focus: só vizinhança"}
            </button>
            <button type="button" onClick={onTogglePin} style={quickActionStyle}>
              {pinned ? "Soltar posição" : "Fixar posição"}
            </button>
          </>
        ) : rel ? (
          <button type="button" onClick={() => onExpand(rel.end_id)} style={quickActionStyle}>
            Expandir {nodesById.get(rel.end_id)?.label_display ?? "destino"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
