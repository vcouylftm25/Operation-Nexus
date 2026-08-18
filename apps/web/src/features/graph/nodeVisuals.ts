/**
 * Per-NodeLabel visual language for the Nexus Graph Workspace v2 canvas
 * (shape + icon + radius), plus the two "derive from real data" heuristics
 * the Money Flow and Timeline canvas modes run on top of the already-merged
 * `GraphPayload` — no new backend fields, no fixture dataset.
 */
import type { NodeLabel } from "@/lib/types";

export type NodeShape = "circle" | "diamond" | "rect" | "device" | "hex" | "message" | "default";

interface NodeVisual {
  r: number;
  shape: NodeShape;
  /** Two stroke-path fragments, 24x24 viewBox, matching the mock's icon style. */
  icon: [string, string];
}

export const TY: Record<NodeLabel, NodeVisual> = {
  Person: {
    r: 27,
    shape: "circle",
    icon: ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"],
  },
  Device: {
    r: 23,
    shape: "device",
    icon: ["M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z", "M11 18h2"],
  },
  Phone: {
    r: 21,
    shape: "device",
    icon: [
      "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z",
      "",
    ],
  },
  Email: {
    r: 21,
    shape: "message",
    icon: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M22 6l-10 7L2 6"],
  },
  IPAddress: {
    r: 21,
    shape: "hex",
    icon: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18", "M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18"],
  },
  Address: {
    r: 21,
    shape: "default",
    icon: ["M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M9 22V12h6v10"],
  },
  BankAccount: {
    r: 24,
    shape: "diamond",
    icon: ["M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M2 10h20"],
  },
  Company: {
    r: 27,
    shape: "rect",
    icon: ["M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M3 22h18", "M10 7h4M10 11h4M10 15h4"],
  },
  Employer: {
    r: 25,
    shape: "rect",
    icon: ["M2 7h20v13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z", "M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 13h20"],
  },
  Broker: {
    r: 23,
    shape: "rect",
    icon: ["M9 17H7a5 5 0 0 1 0-10h2", "M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"],
  },
  Document: {
    r: 21,
    shape: "default",
    icon: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6M8 13h8M8 17h8"],
  },
  Evidence: {
    r: 21,
    shape: "default",
    icon: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16", "M21 21l-4.35-4.35"],
  },
  Message: {
    r: 21,
    shape: "message",
    icon: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", "M8 9h8M8 13h5"],
  },
  Transaction: {
    r: 22,
    shape: "diamond",
    icon: ["M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14", "M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"],
  },
  Application: {
    r: 21,
    shape: "default",
    icon: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6M8 15h6"],
  },
};

const FALLBACK_VISUAL: NodeVisual = { r: 21, shape: "default", icon: ["", ""] };

export function visualFor(labels: string[]): NodeVisual {
  for (const label of labels) {
    const visual = TY[label as NodeLabel];
    if (visual) return visual;
  }
  return FALLBACK_VISUAL;
}

export function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M ${x + r},${y} h ${w - 2 * r} a ${r},${r} 0 0 1 ${r},${r} v ${h - 2 * r} ` +
    `a ${r},${r} 0 0 1 ${-r},${r} h ${-(w - 2 * r)} a ${r},${r} 0 0 1 ${-r},${-r} ` +
    `v ${-(h - 2 * r)} a ${r},${r} 0 0 1 ${r},${-r} Z`
  );
}

export function shapeD(shape: NodeShape, r: number): string {
  switch (shape) {
    case "circle":
      return `M ${-r},0 a ${r},${r} 0 1,0 ${2 * r},0 a ${r},${r} 0 1,0 ${-2 * r},0`;
    case "diamond":
      return `M 0,${-r} L ${r},0 L 0,${r} L ${-r},0 Z`;
    case "rect":
      return roundRect(-r * 1.25, -r * 0.9, r * 2.5, r * 1.8, 4);
    case "device":
      return roundRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7, 7);
    case "hex": {
      const a = r;
      const b = r * 0.86;
      return `M ${-a / 2},${-b} L ${a / 2},${-b} L ${a},0 L ${a / 2},${b} L ${-a / 2},${b} L ${-a},0 Z`;
    }
    case "message":
      return (
        `M ${-r * 0.72},${-r * 0.9} h ${r * 1.16} l ${r * 0.28},${r * 0.34} ` +
        `v ${r * 1.46} h ${-r * 1.44} Z`
      );
    default:
      return roundRect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64, 3);
  }
}

/**
 * Relationship types that represent a movement or control of money/assets.
 * Drives the Money Flow canvas mode — a filter over the real, already-
 * discovered subgraph, not a separate dataset.
 */
const MONEY_RELATIONSHIP_TYPES: ReadonlySet<string> = new Set([
  "TRANSFERRED_TO",
  "FROM_ACCOUNT",
  "TO_ACCOUNT",
  "OWNS_ACCOUNT",
  "CONTROLLED_BY",
]);

export function isMoneyRelationship(type: string): boolean {
  return MONEY_RELATIONSHIP_TYPES.has(type);
}

/**
 * Best-effort event date for a relationship, read straight off its
 * `properties` bag (no schema change). Powers the Timeline canvas mode —
 * relationships without any of these keys simply don't appear on it.
 */
const TIMELINE_DATE_KEYS = [
  "occurred_at",
  "sent_at",
  "captured_at",
  "opened_at",
  "date",
  "created_at",
] as const;

export function extractEventTimestamp(properties: Record<string, unknown>): string | null {
  for (const key of TIMELINE_DATE_KEYS) {
    const value = properties[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}
