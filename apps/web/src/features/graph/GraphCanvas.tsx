import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { GraphRelationship } from "@/lib/types";
import { classificationColor } from "./classification";
import { labelDisplay, relationshipDisplay } from "./colors";
import { useGraphStore, useTeamGraphPayload } from "./graphStore";
import { useGraphViewStore } from "./graphViewStore";
import {
  extractEventTimestamp,
  isMoneyRelationship,
  shapeD,
  shouldShowAllEdgeLabels,
  visualFor,
} from "./nodeVisuals";
import { useNxThemeStore } from "./nxTheme";

interface Pos {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number;
  fy?: number;
}

interface Camera {
  x: number;
  y: number;
  k: number;
}

interface GraphCanvasProps {
  onCommand: (command: string) => void;
  pending?: boolean;
  /** Drives the empty state: in phase 1 an empty canvas is the design, not a bug. */
  phase?: number;
}

const LINK_DISTANCE = 165;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.6;
/**
 * Below this zoom the second caption line under a node is noise, so it goes
 * away and only the name is left. Sits under the zoom "FIT" lands on (~0.7)
 * so the default view keeps the type.
 */
const TYPE_CAPTION_MIN_ZOOM = 0.65;
/** On-screen length an edge needs before its name fits between the two nodes. */
const MIN_EDGE_PX_FOR_LABEL = 96;

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

/**
 * Says out loud that a query is in flight. Without it a click during one looks
 * broken: the command is dropped on purpose and nothing on screen explains why.
 * It rides both the populated canvas and the empty state, since the very first
 * query a team runs is the one where they have the least to look at.
 */
function BusyBadge() {
  return (
    <div
      data-testid="graph-busy"
      style={{
        position: "absolute",
        left: "50%",
        top: 14,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 13px",
        border: "1px solid var(--nx-accent-30)",
        borderRadius: 999,
        background: "var(--nx-card)",
        boxShadow: "0 6px 20px var(--nx-shadow-2)",
        zIndex: 6,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--nx-accent)",
          animation: "nxBreathe 1.4s ease-in-out infinite",
        }}
      />
      <span
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10,
          letterSpacing: "0.14em",
          color: "var(--nx-accent-text)",
        }}
      >
        VERA CONSULTANDO — AGUARDE
      </span>
    </div>
  );
}

export function GraphCanvas({ onCommand, pending, phase = 1 }: GraphCanvasProps) {
  const payload = useTeamGraphPayload();
  const recentIds = useGraphStore((s) => s.recentIds);
  const selectedIds = useGraphStore((s) => s.selectedIds);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const classification = useGraphStore((s) => s.classification);
  const toggleSelect = useGraphStore((s) => s.toggleSelect);
  const selectEdge = useGraphStore((s) => s.selectEdge);
  const clearSelection = useGraphStore((s) => s.select);
  const theme = useNxThemeStore((s) => s.theme);
  const toggleTheme = useNxThemeStore((s) => s.toggle);

  const mode = useGraphViewStore((s) => s.mode);
  const setMode = useGraphViewStore((s) => s.setMode);
  const focus = useGraphViewStore((s) => s.focusId);
  const clearFocus = useGraphViewStore((s) => s.clearFocus);
  const pinnedIds = useGraphViewStore((s) => s.pinnedIds);
  const pinNode = useGraphViewStore((s) => s.pin);
  const unpinAll = useGraphViewStore((s) => s.unpinAll);
  const edgeLabelsEnabled = useGraphViewStore((s) => s.edgeLabelsEnabled);
  const toggleEdgeLabels = useGraphViewStore((s) => s.toggleEdgeLabels);

  const resizeRef = useRef<ResizeObserver | null>(null);
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
  /** Set by any manual pan/zoom/drag: the settle re-fit must not yank the view. */
  const userMovedRef = useRef(false);
  const pendingPathRef = useRef<[string, string] | null>(null);

  const [size, setSize] = useState({ w: 640, h: 420 });
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, k: 1 });
  const [panning, setPanning] = useState(false);
  const [search, setSearch] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
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

  // Callback ref, not an effect: the canvas only mounts once the team has
  // discovered something, and an effect that ran against the empty state left
  // the layout sizing itself against a placeholder viewport forever.
  const attachCanvas = useCallback((el: HTMLDivElement | null) => {
    resizeRef.current?.disconnect();
    resizeRef.current = null;
    if (!el) return;
    const measure = () => {
      const w = Math.max(320, el.clientWidth);
      const h = Math.max(240, el.clientHeight);
      setSize((prev) => (Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    resizeRef.current = observer;
    measure();
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
      };
    });
    if (added) {
      userMovedRef.current = false;
      publishPositions();
      const ids = payload.nodes.map((n) => n.id);
      // Frame what just arrived, then frame it again once the physics settle —
      // the first fit runs while the layout is still contracting, which is how
      // the graph ended up as a tight clump in the middle of a wide canvas.
      const first = window.setTimeout(() => fitTo(ids), 60);
      const settled = window.setTimeout(() => {
        if (!userMovedRef.current) fitTo(ids);
      }, 1100);
      return () => {
        window.clearTimeout(first);
        window.clearTimeout(settled);
      };
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
      clearFocus();
      setPath(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection, clearFocus]);

  // Physics + camera animation loop. Reads/writes posRef/camRef freely (this
  // effect callback is the sanctioned place for that) and only touches React
  // state to publish a snapshot for rendering.
  useEffect(() => {
    function step() {
      const pinned = useGraphViewStore.getState().pinnedIds;
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
        if (pinned[id] || dragRef.current?.id === id) {
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
    userMovedRef.current = true;
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
    userMovedRef.current = true;
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
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        d.moved = true;
        userMovedRef.current = true;
      }
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
        if (d.moved) pinNode(id);
        else toggleSelect(id, e.shiftKey);
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
    if (focus) clearFocus();
    else unpinAll();
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

  /**
   * An edge is "pointed at" when the player is doing something with it, and
   * those always keep their name on screen no matter how dense the view is.
   */
  function isFocusedEdge(rel: GraphRelationship): boolean {
    return (
      selectedEdgeId === rel.id ||
      hoverEdge === rel.id ||
      (path?.edges.includes(rel.id) ?? false) ||
      hover === rel.start_id ||
      hover === rel.end_id ||
      selectedIds.includes(rel.start_id) ||
      selectedIds.includes(rel.end_id)
    );
  }

  const edgeMidpoints = useMemo(() => {
    const out = new Map<string, { x: number; y: number; length: number }>();
    payload.relationships.forEach((rel) => {
      const pa = positions[rel.start_id];
      const pb = positions[rel.end_id];
      if (!pa || !pb) return;
      out.set(rel.id, {
        x: (pa.x + pb.x) / 2,
        y: (pa.y + pb.y) / 2,
        length: Math.hypot(pb.x - pa.x, pb.y - pa.y),
      });
    });
    return out;
  }, [payload.relationships, positions]);

  // Density rule: count the edges whose label would actually land inside the
  // viewport, then ask whether that many chips fit at the current zoom.
  const onScreenEdges = useMemo(() => {
    let count = 0;
    edgeMidpoints.forEach((mid) => {
      const sx = cam.x + mid.x * cam.k;
      const sy = cam.y + mid.y * cam.k;
      if (sx >= -40 && sx <= size.w + 40 && sy >= -20 && sy <= size.h + 20) count += 1;
    });
    return count;
  }, [edgeMidpoints, cam, size.w, size.h]);
  const showAllEdgeLabels = shouldShowAllEdgeLabels(onScreenEdges, cam.k);

  const camTransform = `translate(${cam.x.toFixed(2)},${cam.y.toFixed(2)}) scale(${cam.k.toFixed(3)})`;
  const showTypeCaption = cam.k >= TYPE_CAPTION_MIN_ZOOM;
  const labelWidth = Math.round(Math.max(96, Math.min(170, 130 * cam.k)));

  if (payload.nodes.length === 0) {
    return (
      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 32px",
          textAlign: "center",
          background: "var(--nx-card)",
          overflowY: "auto",
        }}
      >
        <div style={{ maxWidth: 460 }}>
          <p
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              letterSpacing: "0.2em",
              color: "var(--nx-accent-text)",
            }}
          >
            NADA AQUI AINDA — É ASSIM MESMO
          </p>
          <h2 style={{ marginTop: 12, fontSize: 22, fontWeight: 600, color: "var(--nx-ink)" }}>
            A rede ainda não apareceu.
          </h2>
          <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7, color: "var(--nx-muted)" }}>
            O grafo não vem pronto: ele é montado por vocês. Abram uma ficha na lista de casos e
            usem “inspecionar” — cada consulta traz para cá a pessoa e o que ela usou.
          </p>
          <p style={{ marginTop: 10, fontSize: 13, lineHeight: 1.7, color: "var(--nx-muted)" }}>
            {phase <= 1
              ? "Na fase 1 vocês só enxergam pessoas e propostas, sem nenhuma ligação entre elas. As conexões — aparelhos, telefones, contas — entram no caso na fase 2."
              : "Se um item aparecer ligado a duas pessoas diferentes, vocês acharam o primeiro fio da meada."}
          </p>
        </div>
        {pending ? <BusyBadge /> : null}
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
          flexWrap: "wrap",
          gap: 8,
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
                padding: "6px 11px",
                borderRadius: 7,
                cursor: "pointer",
                border: "none",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.12em",
                whiteSpace: "nowrap",
                background: mode === key ? "var(--nx-accent-text)" : "transparent",
                color: mode === key ? "var(--nx-on-accent)" : "var(--nx-muted)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", border: "1px solid var(--nx-line-2)", borderRadius: 8, background: "var(--nx-card)" }}>
            <span style={{ fontSize: 11, color: "var(--nx-muted)" }}>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Buscar entidade"
              style={{ width: 116, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "var(--nx-ink)", fontSize: 11.5 }}
            />
          </div>
          <button
            type="button"
            onClick={toggleEdgeLabels}
            aria-pressed={edgeLabelsEnabled}
            title="Mostrar ou esconder o nome das ligações"
            data-testid="toggle-edge-labels"
            style={{
              ...toolButtonStyle,
              borderColor: edgeLabelsEnabled ? "var(--nx-accent-35)" : "var(--nx-line-2)",
              color: edgeLabelsEnabled ? "var(--nx-accent-text)" : "var(--nx-muted)",
            }}
          >
            RÓTULOS
          </button>
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

      <div ref={attachCanvas} style={{ position: "relative", flex: 1, minHeight: 0 }}>
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
              const marked = classification[rel.id];
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
              if (marked) {
                color = classificationColor(marked);
                width = Math.max(width, 1.8);
              }
              const opacity = edgeOpacity(rel);
              const ah = 7;
              const arrow = `M ${x2},${y2} L ${x2 - ux * ah - uy * ah * 0.55},${y2 - uy * ah + ux * ah * 0.55} L ${x2 - ux * ah + uy * ah * 0.55},${y2 - uy * ah - ux * ah * 0.55} Z`;
              return (
                <g
                  key={rel.id}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); selectEdge(rel.id); }}
                  onPointerEnter={() => setHoverEdge(rel.id)}
                  onPointerLeave={() => setHoverEdge((h) => (h === rel.id ? null : h))}
                >
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
              const marked = classification[node.id];
              const markColor = marked ? classificationColor(marked) : null;
              const isz = visual.r * 0.048;
              return (
                <g
                  key={node.id}
                  transform={`translate(${p.x.toFixed(2)},${p.y.toFixed(2)})`}
                  style={{ cursor: pending ? "wait" : "pointer", opacity, animation: isRecent ? "nxPulse 620ms cubic-bezier(.22,1,.36,1)" : undefined }}
                  onPointerDown={(e) => startDrag(node.id, e)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => { e.stopPropagation(); onCommand(`/expand ${node.id} 1`); }}
                  onPointerEnter={() => setHover(node.id)}
                  onPointerLeave={() => setHover((h) => (h === node.id ? null : h))}
                >
                  {isRecent ? <circle cx={0} cy={0} r={14} style={{ fill: "none", stroke: "var(--nx-accent)", strokeWidth: 1, animation: "nxHalo 1.4s ease-out" }} /> : null}
                  {selected || markColor ? (
                    <path
                      d={shapeD(visual.shape, visual.r + 6)}
                      style={{
                        fill: "none",
                        stroke: selected ? "var(--nx-accent-35)" : (markColor ?? "transparent"),
                        strokeWidth: 1,
                        opacity: selected ? 1 : 0.45,
                      }}
                    />
                  ) : null}
                  {/* The team's mark owns the shape's ring; selection shows as
                      the accent halo above, so opening a node never hides how
                      it was classified. */}
                  <path
                    d={shapeD(visual.shape, visual.r)}
                    style={{
                      fill: "var(--nx-node-fill)",
                      stroke: markColor ?? (selected ? "var(--nx-accent)" : "var(--nx-node-stroke)"),
                      strokeWidth: selected || markColor ? 1.8 : 1.2,
                    }}
                  />
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
          {edgeLabelsEnabled
            ? payload.relationships.map((rel) => {
                const mid = edgeMidpoints.get(rel.id);
                if (!mid) return null;
                const focused = isFocusedEdge(rel);
                // A chip on a stub of a line lands on the node captions at
                // both ends, so short edges only get named on purpose.
                const roomy = mid.length * cam.k >= MIN_EDGE_PX_FOR_LABEL;
                if (!focused && (!showAllEdgeLabels || !roomy)) return null;
                const opacity = edgeOpacity(rel);
                if (opacity < 0.25) return null;
                const amount = rel.properties.amount;
                const label =
                  moneyMode && isMoneyRelationship(rel.type) && (typeof amount === "string" || typeof amount === "number")
                    ? String(amount)
                    : relationshipDisplay(rel.type).toUpperCase();
                const marked = classification[rel.id];
                return (
                  <div
                    key={rel.id}
                    style={{
                      position: "absolute",
                      left: cam.x + mid.x * cam.k,
                      top: cam.y + mid.y * cam.k,
                      transform: "translate(-50%,-50%)",
                      padding: "2px 5px",
                      borderRadius: 4,
                      background: "var(--nx-canvas)",
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      whiteSpace: "nowrap",
                      color: marked ? classificationColor(marked) : "var(--nx-accent-text)",
                      opacity: opacity * 0.95,
                      transition: "opacity 180ms",
                      zIndex: 1,
                    }}
                  >
                    {label}
                  </div>
                );
              })
            : null}
          {payload.nodes.map((node) => {
            const p = positions[node.id];
            if (!p) return null;
            const visual = visualFor(node.labels);
            const opacity = nodeOpacity(node.id);
            return (
              <div
                key={node.id}
                style={{
                  position: "absolute",
                  left: cam.x + p.x * cam.k,
                  top: cam.y + p.y * cam.k + visual.r * cam.k + 7,
                  transform: "translateX(-50%)",
                  width: labelWidth,
                  textAlign: "center",
                  opacity,
                  transition: "opacity 180ms",
                  zIndex: 2,
                }}
              >
                {/* The canvas-coloured plate keeps a name readable when an
                    edge or a relationship chip runs underneath it. */}
                <div
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
                    padding: "1px 4px",
                    borderRadius: 4,
                    background: "var(--nx-canvas)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12.5 * Math.min(1.3, Math.max(0.8, cam.k)),
                      lineHeight: 1.25,
                      fontWeight: 500,
                      color: "var(--nx-ink)",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {node.label_display}
                  </div>
                  {showTypeCaption ? (
                    <div
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 9,
                        letterSpacing: "0.12em",
                        color: "var(--nx-muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {labelDisplay(node.labels).toUpperCase()}
                    </div>
                  ) : null}
                </div>
                {pinnedIds[node.id] ? (
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 9.5,
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
            display: mode === "timeline" || selectedIds.length >= 2 ? "none" : "flex",
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
              maxWidth: "calc(100% - 32px)",
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
              width: 240,
              maxWidth: "calc(100% - 28px)",
              maxHeight: "calc(100% - 96px)",
              overflowY: "auto",
              padding: 14,
              border: "1px solid var(--nx-accent-35)",
              borderRadius: 16,
              background: "var(--nx-card)",
              animation: "nxRise .32s cubic-bezier(.22,1,.36,1)",
              zIndex: 4,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: "var(--nx-accent-text)" }}>
                CAMINHO · {path.edges.length} SALTO{path.edges.length === 1 ? "" : "S"}
              </span>
              <button
                type="button"
                onClick={() => setPath(null)}
                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--nx-muted)" }}
              >
                ✕
              </button>
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

        {pending ? <BusyBadge /> : null}

        {selectedIds.length >= 2 ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 16,
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 10,
              maxWidth: "calc(100% - 28px)",
              padding: "9px 12px",
              border: "1px solid var(--nx-line-2)",
              borderRadius: 16,
              background: "var(--nx-card)",
              animation: "nxRise .24s cubic-bezier(.22,1,.36,1)",
              zIndex: 4,
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
                <button
                  key={rel.id}
                  type="button"
                  onClick={() => { selectEdge(rel.id); setMode("network"); }}
                  style={{
                    minWidth: 150,
                    padding: "0 14px 2px",
                    border: "none",
                    borderLeft: "1px solid var(--nx-line-2)",
                    background: "transparent",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em", color: "var(--nx-muted)" }}>
                    {formatTimelineDate(ts)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--nx-ink)", marginTop: 5 }}>{relationshipDisplay(rel.type)}</div>
                  <div style={{ fontSize: 10.5, color: "var(--nx-muted)", marginTop: 3 }}>
                    {nodesById.get(rel.start_id)?.label_display ?? rel.start_id} → {nodesById.get(rel.end_id)?.label_display ?? rel.end_id}
                  </div>
                </button>
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
  whiteSpace: "nowrap",
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
