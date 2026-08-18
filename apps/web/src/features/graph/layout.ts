export interface Point {
  x: number;
  y: number;
}

export function forceLayout(
  nodeIds: string[],
  edges: { start_id: string; end_id: string }[],
  width: number,
  height: number,
): Map<string, Point> {
  const pos = new Map<string, Point>();
  const n = Math.max(nodeIds.length, 1);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.34;
  nodeIds.forEach((id, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    pos.set(id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  });

  const kRep = 2200;
  const kSpring = 0.045;
  const rest = 150;

  for (let iter = 0; iter < 80; iter += 1) {
    const disp = new Map<string, Point>();
    for (const id of nodeIds) disp.set(id, { x: 0, y: 0 });

    for (let i = 0; i < nodeIds.length; i += 1) {
      for (let j = i + 1; j < nodeIds.length; j += 1) {
        const aId = nodeIds[i];
        const bId = nodeIds[j];
        if (!aId || !bId) continue;
        const a = pos.get(aId);
        const b = pos.get(bId);
        const da = disp.get(aId);
        const db = disp.get(bId);
        if (!a || !b || !da || !db) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist2 = dx * dx + dy * dy + 0.01;
        const force = kRep / dist2;
        da.x += dx * force;
        da.y += dy * force;
        db.x -= dx * force;
        db.y -= dy * force;
      }
    }

    for (const edge of edges) {
      const a = pos.get(edge.start_id);
      const b = pos.get(edge.end_id);
      const da = disp.get(edge.start_id);
      const db = disp.get(edge.end_id);
      if (!a || !b || !da || !db) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const pull = (dist - rest) * kSpring;
      const ox = (dx / dist) * pull;
      const oy = (dy / dist) * pull;
      da.x += ox;
      da.y += oy;
      db.x -= ox;
      db.y -= oy;
    }

    for (const id of nodeIds) {
      const p = pos.get(id);
      const d = disp.get(id);
      if (!p || !d) continue;
      p.x = Math.min(width - 48, Math.max(48, p.x + d.x * 0.07));
      p.y = Math.min(height - 36, Math.max(36, p.y + d.y * 0.07));
    }
  }

  return pos;
}
