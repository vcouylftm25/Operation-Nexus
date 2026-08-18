# Handoff: Operation Nexus — Graph Investigation Workspace

## Overview
Interactive relationship-graph workspace for "Operation Nexus", a live investigation game (fraud-network / knowledge-graph tech talk). This is the Round 2+ screen: a war room where players click, drag, expand and classify entities/relations in an evolving knowledge graph while chatting with an AI investigation copilot.

## About the Design Files
The files in this bundle are **design references built as self-contained HTML prototypes** (React-like component runtime, inlined). They demonstrate exact layout, styling, motion and interaction behavior — they are **not production code to copy as-is**. The task is to **recreate this design in the target codebase's real stack** (whatever the app already uses — React/Vue/Svelte, native, etc. — or the most sensible modern framework if none exists yet), wiring the graph and chat to a real backend (Neo4j / GraphRAG pipeline) instead of the mocked in-memory data used here.

## Fidelity
**High-fidelity.** Colors, spacing, typography, motion timings and micro-copy (in Brazilian Portuguese) are final. Recreate pixel-close using the target codebase's component library where one exists; otherwise implement fresh per the tokens below.

Two theme variants are included:
- `Nexus Graph Workspace.dc.html` — original dark/amber direction (concept exploration).
- `Nexus Graph Workspace v2 (Lifetime).dc.html` — **current/preferred**: Lifetime Brasa design system, with a light/dark theme toggle. Use this one as the source of truth.

## Screens / Views
Single screen, three-pane workspace + header/footer, four states layered on top (inspector panel swaps content, not a separate screen):

### Layout (1440×900 target, min-width 1240px)
```
grid-template-rows: 54px header / 38px mission bar / 1fr workspace / 104px footer
workspace: grid-template-columns: 304px left rail / 1fr graph canvas / 344px AI panel
```

- **Header (54px)**: logo dot + "NEXUS" wordmark (left) · team name · round label (center) · light/dark toggle, credits counter, countdown timer (right).
- **Mission bar (38px)**: eyebrow "MISSÃO" + one-line objective text.
- **Left rail (304px, scrollable)**: either the node/edge **Inspector** (when something is selected) or the default **Case Files** list (person cards for the round's targets) + discovered-entity counts + hidden-entities chips + a one-line help hint.
- **Center — Graph canvas**: toolbar (Network/Money Flow/Timeline segmented control, search box, FIT/zoom/unpin tools) above an SVG canvas with an HTML overlay layer for text labels (SVG `<text>` cannot hold live template bindings — see Interactions). A legend box floats bottom-left. Contextual floating cards: path result (top-right), multi-select action bar (bottom-center), money-empty-state card (centered), timeline strip (bottom band, own row — not an overlay).
- **Right rail (344px)**: "Nexus AI" header, scrollable conversation feed (trace steps, bullet answers, "ver no grafo" CTA), quick-action chip row, free-text input.
- **Footer (104px)**: Investigation Board (suspect/uncertain/explained counters) + lock-in hint + "TRAVAR CLUSTER" primary button.
- **Modals**: centered overlay (expand-confirm, insufficient-credits, lock-in with textarea) — backdrop blur, scale+fade in.
- **Toasts**: fixed top-right-ish card, auto or manual dismiss.

## Components
### Node (SVG group, draggable)
- Shape by entity type (drawn as path): person = circle, account = diamond, company = rounded rect (wide), device = rounded square, ip = hexagon, message = envelope notch, application/default = rounded square.
- Radius per type: person/company 27, device 23, account 24, ip/address/message/application 21.
- Icon: Lucide-style line icon centered in shape (person, smartphone, credit-card, building, globe, home, message-square, file-text), stroke `var(--nx-muted)` normally, accent when selected.
- Fill `var(--nx-node-fill)`, stroke `var(--nx-node-stroke)` (or accent-35% ring when selected, or status color when classified).
- HTML overlay label below node: name (13px/500) + type caption (9px mono uppercase) + "FIXADO" tag (10px, accent-text, shown only when pinned).
- States: default / hovered (neighborhood highlighted, rest dimmed to ~35% opacity) / selected (accent ring + halo pulse on first discovery) / dimmed (0.06–0.35 opacity depending on active focus/path/money/hover mode) / pinned (position locked, small pin tag).

### Edge
- SVG line between node boundaries (not centers — inset by radius+4), optional arrowhead (triangle) when directional.
- Stroke `var(--nx-edge)` default, `var(--nx-accent)` when part of an active path/selection, status color when classified, width 1.1–2.2px.
- Label: HTML overlay chip (9px mono uppercase, `var(--nx-accent-text)`), shown only on hover/select/high zoom/path — else opacity 0 to reduce clutter.
- New edges animate in: `stroke-dasharray`/`stroke-dashoffset` draw-on over ~520ms, cubic-bezier(.22,1,.36,1).

### Inspector panel (left rail, replaces Case Files when a node/edge is selected)
- Eyebrow kind label (mono, 9.5px, uppercase, muted) + close "✕".
- Title (19px/500) + subtitle (12px muted).
- Optional current-classification chip (dot + label).
- Key/value rows (10.5px uppercase key muted / 11.5px mono value) — divider hairline between rows.
- "CLASSIFICAR" section: 3 pill buttons (Suspeito / Incerto / Explicado), each dot-colored, active state = colored border + colored dot.
- "INVESTIGAÇÕES DISPONÍVEIS": list of action rows (label + cost badge), e.g. Expandir conexões · 15 CR, Buscar entidades em comum · 10 CR, Fixar/Soltar posição · FREE, Focus mode, Ocultar do canvas.

### AI copilot feed message
- Card: 13/14px padding, 12px radius, hairline border (accent-tinted for AI, neutral for user).
- Eyebrow role label (mono, 9.5px, accent-text for AI / muted for user, self-aligned).
- Body text 12.5px/1.6, `white-space:pre-line`.
- Optional bullet list (11.5px, accent bullet dot).
- Optional trace steps (label + ✓/···/blank mono status).
- Optional "VER NO GRAFO" CTA chip (accent-text border+text) that re-selects & re-frames the referenced nodes.

### Buttons / chips
- Primary solid: `background: var(--nx-accent-text)` (NOT the raw accent — see Design Tokens/contrast note), white text, 10px radius, 12px/600 label, translateY(-1px) on hover.
- Secondary/outline: 1px hairline border, transparent fill, muted text → ink on hover.
- Segmented control (Network/Money/Timeline): 3px padding container, active segment = solid `--nx-accent-text` fill + white label (never translucent-fill + colored-text — that combo fails contrast and is disallowed by the bound design system).
- Cost badge: mono 10–10.5px, `var(--nx-accent-text)`.

### Toast / Modal
- Modal: centered, `width` 410–460px, 16px radius, backdrop blur+dim, eyebrow/title/body/list/optional textarea/cancel+confirm buttons.
- Toast: 250px card, eyebrow + body + dismiss link, slide/fade in.

## Interactions & Behavior
- **Click node/edge** → select, populate Inspector.
- **Shift+click** → multi-select (accumulate); shows floating action bar (Conexões em comum · 10 CR, Encontrar caminho · 15 CR, Marcar como cluster · free).
- **Double-click node** → confirmation modal ("Expandir X? 15 Intel Credits") before spending — prevents accidental spend. On confirm: reveals connected undiscovered edges/nodes, animates them in radiating from the source node, cost deducted with a small "−15" flash near the credit counter.
- **Drag node** → repositions and pins it (force-directed layout stops moving it); releasing without movement is treated as a click/select, not a drag.
- **Pan** (drag empty canvas) / **Zoom** (wheel, or +/− toolbar, zoom-to-cursor) / **FIT** (auto-frames visible nodes).
- **Force-directed layout**: unpositioned/unpinned nodes settle via simple physics (center gravity + node repulsion + edge spring at ~165px rest length); runs continuously via `requestAnimationFrame`, damped, stops naturally when settled.
- **Find path** (2 selected) → BFS shortest path, dims everything except the path (opacity ~0.1 elsewhere), shows a floating path card with the hop chain, camera fits to the path.
- **Find shared connections** (2+ selected) → reveals/highlights common neighbors.
- **Focus mode** (from Inspector) → shows only 1-hop neighborhood, dims rest to ~0.06.
- **Hide from canvas** → removes node from view without deleting data; reappears as a restore chip in the left rail ("ENTIDADES OCULTAS (n)").
- **Mode switch**: Network (default) / Money Flow (dims non-financial edges/nodes; shows an empty-state card with a "voltar" CTA when no financial edges are discovered yet — never silently renders a blank/broken-looking canvas) / Timeline (canvas shrinks; a bottom band lists discovered dated events with a temporal-conflict flag when applicable — this is a separate flex row, not an absolutely-positioned overlay, so it never collides with the legend or node labels).
- **Search** (canvas toolbar) → find by name, select + camera-fit.
- **AI chat**: free text or quick-action chips spend credits, run a 3-step fake "trace" (Interpretando pergunta → Consultando relações → Recuperando evidências, each ~450–500ms) then post an answer bubble, optionally with a "ver no grafo" focus action.
- **Insufficient credits** → never a raw error; a modal explains the cost vs. balance in plain language.
- **Lock-in** (footer) → requires 2+ selected entities; opens modal listing them + a required rationale textarea; confirms into a toast ("aguardando as outras equipes").
- **Theme toggle** (v2 only) → light/dark; swaps a single CSS-variable set at the theme root (see tokens) — component styling never hardcodes hex, so nothing needs per-component dark-mode logic.
- **Motion**: hover 150–180ms ease-out; panel enter 250–350ms opacity+translateY(6–12px); modal 180ms backdrop / 280ms container scale .98→1; new-node pulse ~620ms; edge draw ~520ms; camera pan/zoom animated ~460ms cubic ease; all `cubic-bezier(.4,0,.2,1)`, no bounce.
- **Reduced motion**: not yet implemented in the prototype — add `prefers-reduced-motion` handling in production (disable pulses/camera easing, keep instant state changes).

## State Management
Key state needed:
- `discoveredNodes: string[]`, `discoveredEdges: string[]` — the *team's* subgraph (distinct from the full ground-truth graph in the backend).
- `selection: string[]` (node ids), `selectedEdge: string | null`.
- `hoveredNode`, `focusNodeId`, `hiddenNodeIds: string[]`.
- `pinnedPositions: Record<id, {x,y}>` and live `{x,y,vx,vy}` per node for the layout simulation.
- `camera: {x,y,k}` (pan/zoom transform).
- `mode: 'network' | 'money' | 'timeline'`.
- `credits: number`, with an ephemeral "last delta" for the flash animation.
- `classification: Record<id, 'suspect'|'uncertain'|'explained'>` for nodes and edges.
- `pathResult: {nodes, edges} | null`.
- `aiFeed: Message[]`, `chatInput`, in-flight trace step state.
- `modal`, `toast` (transient UI state).
- `theme: 'light' | 'dark'`.
- **Critical rule from the game design**: the client must never hold or reveal ground-truth fraud labels. `classification` is the *player's own guess*, not a correctness flag. Real backend calls should only ever return what that team has "paid" to discover.

## Design Tokens
CSS custom properties, themed at a root element (`[data-nx-theme="light"|"dark"]`), inherited via `color` set on that same root so nested elements pick up the right ink without per-component overrides:

```css
/* light (default) */
--nx-bg:#F4F2EC; --nx-surface:#FAF8F4; --nx-card:#FFFFFF; --nx-elev:#F4F2EC; --nx-canvas:#FFFFFF;
--nx-node-fill:#FFFFFF; --nx-ink:#141210; --nx-muted:#5C6672;
--nx-accent:#F5540A;        /* brasa — fills, borders, graph strokes, hover/pressed. NEVER small text on light bg (fails AA) */
--nx-accent-text:#D23B0F;   /* brasa-strong — any small text/label in accent color, or white-on-accent solid buttons */
--nx-on-accent:#FFFFFF;
--nx-danger:#C62828; --nx-attention:#C6892A; --nx-explained:#2F9E5E;
--nx-line:rgba(20,18,16,.09); --nx-line-2:rgba(20,18,16,.13); --nx-line-3:rgba(20,18,16,.20);
--nx-edge:rgba(20,18,16,.22); --nx-node-stroke:rgba(20,18,16,.18); --nx-grid:rgba(20,18,16,.07);
--nx-accent-06/-08/-18/-28/-30/-35/-45: rgba(245,84,10, .06→.45);  /* tinted fills at increasing opacity */
--nx-shadow-1/-2/-3: rgba(20,18,16, .05/.09/.14);
--nx-backdrop: rgba(20,18,16,.30); --nx-glass: rgba(255,255,255,.92);

/* dark */
--nx-bg:#070A0F; --nx-surface:#0B0F16; --nx-card:#0D121B; --nx-elev:#111722; --nx-canvas:#070A0F;
--nx-node-fill:#111722; --nx-ink:#F5F7FA; --nx-muted:#96A2B0;
--nx-accent:#2FD08A;       /* green in dark mode — deliberately different hue from light's orange, and from suspect/uncertain */
--nx-accent-text:#4FE0A4; --nx-on-accent:#06140E;
--nx-danger:#FF7A6B; --nx-attention:#E3B04B;
--nx-explained:#9FB3C7;    /* NOT green in dark mode — green is taken by the accent, so "explained" moves to slate to avoid collision */
/* line/edge/grid/tint/shadow tokens mirror light but inverted, using white-based alphas */
```

**Contrast rule (verified against WCAG AA):** raw `--nx-accent` fails AA for small text on light backgrounds (~3.4:1). Any text under 18px, and any solid-fill button with a text label, must use `--nx-accent-text`, never `--nx-accent` directly. `--nx-accent` itself is only for: borders, icon strokes, graph edges, background tints (`--nx-accent-06…45`), and the segmented-control active fill (paired with white text, which passes at the accent-text value).

**Typography**: Urbane (weights 100/300/500/600/700 as Thin/Light/Medium/DemiBold/Bold) for all UI text; IBM Plex Mono (400/500/600) for operational data — timers, credit counts, entity IDs, edge-type labels, mono badges. Display/eyebrow tracking: `-0.01em to -0.03em` on large numerals, `+0.10em to +0.18em` uppercase on eyebrows.

**Radii**: inputs/chips 8–9px, buttons/controls 10px, cards/modals 12–16px, pills/avatars full.

**Type scale used**: 9px / 9.5px / 10px / 10.5px / 11px / 11.5px / 12px / 12.5px / 13px / 14px / 15px / 19px / 21px — mostly a compact UI scale since this is a dense workspace, not marketing copy. (Note: keep body text ≥12px in production; several 9–10px labels here are secondary/eyebrow only.)

## Assets
- **Icons**: Lucide-style line icons (stroke-based, hand-authored as SVG paths in this prototype to avoid a CDN dependency) — in production, pull the real Lucide set: user, smartphone, credit-card, building-2, globe, home, message-square, file-text.
- **Fonts**: Urbane (TTF, DS-provided) + IBM Plex Mono (Google Fonts).
- No raster images/photos used — this screen is entirely typographic + vector.

## Screenshots
See `screenshots/` — light mode default state, light mode with node selected (Inspector panel open), dark mode with the same selection (compare the theme token swap: accent orange→green, "explicado" green→slate).

## Files
- `Nexus Graph Workspace v2 (Lifetime).dc.html` — **primary reference**, light/dark themed, Lifetime Brasa palette. Build from this one.
- `Nexus Graph Workspace.dc.html` — earlier dark/amber concept exploration, included for context only.

Both are self-contained runnable HTML (open directly in a browser) built on an internal component-template runtime (`support.js`, bundled inline) — treat `<script data-dc-script>`'s `class Component extends DCLogic { ... }` body as the reference implementation for state/logic (physics loop, camera math, path-finding BFS, credit spend flow, etc.) and the markup above it as the reference DOM/CSS structure. Ignore the `DCLogic`/template-runtime scaffolding itself; it's specific to this design tool, not something to port.
