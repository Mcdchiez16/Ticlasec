"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_ICON } from "./icons";
import {
  CATEGORY_STYLE,
  LANE_META,
  LAYOUT,
  focusConnections,
  groupConnections,
  layoutOverview,
  middleTruncate,
  visibleEdges,
  type FocusConnection,
  type LaneKey,
  type MapEdge,
  type MapModel,
  type MapNode,
} from "./model";

export type MapMode = "overview" | "focus";

interface Props {
  model: MapModel;
  mode: MapMode;
  selectedId: string | null;
  searchMatches: ReadonlySet<string>;
  pathNodes: readonly string[];
  pathEdges: readonly MapEdge[];
  expandedLanes: ReadonlySet<LaneKey>;
  pinned: ReadonlySet<string>;
  /** the reader is choosing the second end of a path */
  picking: boolean;
  /** bump to re-fit the view */
  fitSignal: number;
  /** bump to discard manual card positions and restore the aligned layout */
  layoutSignal: number;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
  onToggleLane: (lane: LaneKey) => void;
  /** current zoom, so the toolbar can show it */
  onZoom: (k: number) => void;
  zoomCommand: { id: number; dir: 1 | -1 } | null;
}

type View = { x: number; y: number; k: number };

const { nodeHeight: NH, nodeWidth: NW } = LAYOUT;
const MIN_K = 0.35;
const MAX_K = 2.2;

const tint = (color: string, pct = 14) => `color-mix(in srgb, ${color} ${pct}%, var(--bg-surface))`;

// ── Edge geometry ───────────────────────────────────────────────────────────

interface Anchor {
  x: number;
  y: number;
}

function curve(a: Anchor, b: Anchor): { d: string; mid: Anchor } {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  const sign = b.x >= a.x ? 1 : -1;
  const c1 = { x: a.x + sign * dx, y: a.y };
  const c2 = { x: b.x - sign * dx, y: b.y };
  const mid = {
    x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8,
    y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8,
  };
  return { d: `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`, mid };
}

/** A link between two cards in the same lane bows out to the right so it never crosses the cards. */
function arc(a: Anchor, b: Anchor): { d: string; mid: Anchor } {
  const bulge = Math.min(70, 28 + Math.abs(b.y - a.y) * 0.12);
  const x = Math.max(a.x, b.x) + bulge;
  return { d: `M${a.x},${a.y} C${x},${a.y} ${x},${b.y} ${b.x},${b.y}`, mid: { x: x - bulge * 0.25, y: (a.y + b.y) / 2 } };
}

// ── Pieces ──────────────────────────────────────────────────────────────────

interface CardState {
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  matched: boolean;
  onPath: boolean;
  picking: boolean;
  focusCenter?: boolean;
  dragging?: boolean;
}

function Card({
  node,
  x,
  y,
  width = NW,
  height = NH,
  state,
  onSelect,
  onOpen,
  onHover,
  onDragStart,
}: {
  node: MapNode;
  x: number;
  y: number;
  width?: number;
  height?: number;
  state: CardState;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onHover: (id: string | null) => void;
  onDragStart?: (event: React.PointerEvent<SVGGElement>, id: string) => void;
}) {
  const style = CATEGORY_STYLE[node.category];
  const Icon = CATEGORY_ICON[node.category];
  const active = state.selected || state.focusCenter;
  const stroke = active ? "var(--accent)" : state.onPath ? "var(--warning)" : state.matched ? "var(--warning)" : state.hovered ? style.color : "var(--border-subtle)";
  const confidence = node.confidence != null ? `${Math.round(node.confidence * 100)}%` : null;
  const labelMax = Math.floor((width - 92) / 7.4);
  return (
    <g
      transform={`translate(${x},${y})`}
      opacity={state.dimmed ? 0.32 : 1}
      style={{ cursor: state.picking ? "crosshair" : state.dragging ? "grabbing" : onDragStart ? "grab" : "pointer", transition: "opacity 160ms" }}
      role="button"
      tabIndex={0}
      aria-label={`${style.label}: ${node.full}. ${node.degree} connection${node.degree === 1 ? "" : "s"}.`}
      aria-pressed={state.selected}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen(node.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
      onPointerDown={(event) => {
        if (!onDragStart || state.picking) return;
        event.stopPropagation();
        onDragStart(event, node.id);
      }}
      data-node={node.id}
    >
      <rect
        width={width}
        height={height}
        rx={10}
        fill="var(--bg-surface)"
        stroke={stroke}
        strokeWidth={active || state.onPath || state.matched ? 2.5 : 1.5}
        style={{ filter: active ? "drop-shadow(0 6px 10px rgba(37,99,235,0.25))" : state.hovered ? "drop-shadow(0 3px 6px rgba(20,35,59,0.16))" : "drop-shadow(0 1px 2px rgba(20,35,59,0.08))" }}
      />
      <circle cx={25} cy={height / 2} r={15} fill={tint(style.color, 16)} />
      <Icon x={17} y={height / 2 - 8} width={16} height={16} color={style.color} strokeWidth={2.4} />
      <text x={48} y={height / 2 - 3} fontSize={13} fontWeight={800} fill="var(--text-primary)" style={{ pointerEvents: "none" }}>
        {middleTruncate(node.label, labelMax)}
      </text>
      <text x={48} y={height / 2 + 12} fontSize={10.5} fontWeight={700} fill="var(--text-muted)" style={{ pointerEvents: "none" }}>
        {style.label}
        {confidence ? ` · ${confidence}` : ""}
      </text>
      {node.degree > 0 && (
        <g transform={`translate(${width - 22},${height / 2})`} style={{ pointerEvents: "none" }}>
          <rect x={-13} y={-10} width={26} height={20} rx={10} fill="var(--bg-raised)" />
          <text textAnchor="middle" y={4} fontSize={11} fontWeight={800} fill="var(--text-secondary)">
            {node.degree > 99 ? "99+" : node.degree}
          </text>
        </g>
      )}
    </g>
  );
}

function EdgeLine({
  d,
  edge,
  sourceColor,
  tone,
  dimmed,
}: {
  d: string;
  edge: MapEdge;
  sourceColor: string;
  tone: "normal" | "active" | "path";
  dimmed: boolean;
}) {
  const strong = edge.strong;
  const color = tone === "path" ? "var(--warning)" : tone === "active" ? "var(--accent)" : strong ? sourceColor : "var(--border-strong)";
  const width = tone === "normal" ? (strong ? 1.6 + edge.confidence * 1.4 : 1.1) : strong ? 3 : 2.2;
  const marker = edge.directed && strong ? (tone === "path" ? "url(#mc-arrow-path)" : tone === "active" ? "url(#mc-arrow-active)" : "url(#mc-arrow)") : undefined;
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeDasharray={strong ? undefined : "5 5"}
      strokeLinecap="round"
      opacity={dimmed ? 0.12 : tone === "normal" ? (strong ? 0.6 : 0.75) : 1}
      markerEnd={marker}
      style={{ transition: "opacity 160ms", pointerEvents: "none" }}
    />
  );
}

function EdgeLabel({ x, y, text, tone }: { x: number; y: number; text: string; tone: "active" | "path" }) {
  const w = Math.max(60, text.length * 6.4 + 18);
  const color = tone === "path" ? "var(--warning)" : "var(--accent)";
  return (
    <g transform={`translate(${x},${y})`} style={{ pointerEvents: "none" }}>
      <rect x={-w / 2} y={-11} width={w} height={22} rx={11} fill="var(--bg-surface)" stroke={color} strokeWidth={1.5} />
      <text textAnchor="middle" y={4} fontSize={11} fontWeight={800} fill={color}>
        {text}
      </text>
    </g>
  );
}

// ── Focus layout ────────────────────────────────────────────────────────────

interface FocusItem {
  conn: FocusConnection;
  x: number;
  y: number;
  side: "left" | "right";
}

interface FocusHeading {
  label: string;
  weak: boolean;
  side: "left" | "right";
  x: number;
  y: number;
  hidden: number;
  total: number;
}

function layoutFocusView(model: MapModel, id: string) {
  const center = model.nodes.get(id);
  if (!center) return null;
  const groups = groupConnections(focusConnections(model, id), 12);
  const incoming = groups.filter((g) => g.items[0]?.incoming);
  const outgoing = groups.filter((g) => !g.items[0]?.incoming);
  // when everything points one way, keep the entity at the edge instead of leaving an empty column
  const colGap = 150;
  const CW = 260;
  const CH = 64;
  const leftX = 24;
  const centerX = incoming.length ? leftX + NW + colGap : leftX;
  const rightX = centerX + CW + colGap;

  const items: FocusItem[] = [];
  const headings: FocusHeading[] = [];
  const notes: { x: number; y: number; count: number }[] = [];
  const place = (list: typeof groups, side: "left" | "right", x: number) => {
    let y = 24;
    for (const g of list) {
      headings.push({ label: g.label, weak: g.weak, side, x, y, hidden: g.hidden, total: g.items.length + g.hidden });
      y += 30;
      for (const conn of g.items) {
        items.push({ conn, x, y, side });
        y += NH + 8;
      }
      if (g.hidden > 0) {
        notes.push({ x, y, count: g.hidden });
        y += 26;
      }
      y += 14;
    }
    return y;
  };
  const leftH = place(incoming, "left", leftX);
  const rightH = place(outgoing, "right", rightX);
  const height = Math.max(leftH, rightH, 220);
  const centerY = Math.max(24, (height - CH) / 2);
  const width = (outgoing.length ? rightX + NW : centerX + CW) + 24;
  return { center, centerX, centerY, CW, CH, items, headings, notes, width, height: height + 24 };
}

// ── Canvas ──────────────────────────────────────────────────────────────────

export function MapCanvas(props: Props) {
  const { model, mode, selectedId, searchMatches, pathNodes, pathEdges, expandedLanes, pinned, picking, fitSignal, layoutSignal, onSelect, onOpen, onToggleLane, onZoom, zoomCommand } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [manualPositions, setManualPositions] = useState<Map<string, { x: number; y: number }>>(() => new Map());
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const moved = useRef(false);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; id: number } | null>(null);
  const nodeDrag = useRef<{ id: string; pointerId: number; x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppressCardAction = useRef(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // what the reader asked to see, so selecting an entity always reveals it
  const pinnedAll = useMemo(() => {
    const set = new Set<string>(pinned);
    for (const id of pathNodes) set.add(id);
    for (const id of searchMatches) if (set.size < 40) set.add(id);
    if (selectedId && model.nodes.has(selectedId)) {
      set.add(selectedId);
      let n = 0;
      for (const e of model.adjacency.get(selectedId) ?? []) {
        if (n++ >= 24) break;
        set.add(e.source === selectedId ? e.target : e.source);
      }
    }
    return set;
  }, [pinned, pathNodes, searchMatches, selectedId, model]);

  const overview = useMemo(() => layoutOverview(model, { expandedLanes, pinned: pinnedAll }), [model, expandedLanes, pinnedAll]);
  const positions = useMemo(() => {
    const next = new Map(overview.positions);
    for (const [id, point] of manualPositions) {
      const original = next.get(id);
      if (original) next.set(id, { ...original, ...point });
    }
    return next;
  }, [overview.positions, manualPositions]);
  const focus = useMemo(() => (mode === "focus" && selectedId ? layoutFocusView(model, selectedId) : null), [mode, selectedId, model]);
  const showFocus = mode === "focus" && focus != null;
  const manualBounds = useMemo(() => {
    let w = overview.width;
    let h = overview.height;
    for (const point of positions.values()) {
      w = Math.max(w, point.x + NW + LAYOUT.pad);
      h = Math.max(h, point.y + NH + LAYOUT.pad);
    }
    return { w, h };
  }, [overview.width, overview.height, positions]);
  const content = showFocus ? { w: focus.width, h: focus.height } : { w: Math.max(manualBounds.w, 320), h: Math.max(manualBounds.h, 240) };

  useEffect(() => {
    setManualPositions(new Map());
    setDraggingNode(null);
    nodeDrag.current = null;
  }, [layoutSignal]);

  const fit = useCallback(() => {
    const pad = 28;
    const k = Math.min((size.w - pad * 2) / content.w, (size.h - pad * 2) / content.h, 1.15);
    const kk = Math.max(MIN_K, k);
    setView({ k: kk, x: Math.max(pad, (size.w - content.w * kk) / 2), y: Math.max(pad, Math.min((size.h - content.h * kk) / 2, 56)) });
    moved.current = false;
  }, [size.w, size.h, content.w, content.h]);

  // re-fit on request, on mode change, and when the layout changes size while the reader has not panned
  const signature = `${mode}:${selectedId ?? ""}:${Math.round(content.w)}x${Math.round(content.h)}`;
  const lastSignature = useRef("");
  useEffect(() => {
    if (fitSignal !== 0 || lastSignature.current === "") moved.current = false;
  }, [fitSignal]);
  useEffect(() => {
    if (!moved.current || lastSignature.current.split(":")[0] !== mode) fit();
    lastSignature.current = signature;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, fitSignal, size.w, size.h]);
  useEffect(() => onZoom(view.k), [view.k, onZoom]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const r = k / v.k;
      return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
    });
    moved.current = true;
  }, []);

  const lastCommand = useRef(0);
  useEffect(() => {
    if (!zoomCommand || zoomCommand.id === lastCommand.current) return;
    lastCommand.current = zoomCommand.id;
    zoomAt(zoomCommand.dir > 0 ? 1.2 : 1 / 1.2, size.w / 2, size.h / 2);
  }, [zoomCommand, zoomAt, size.w, size.h]);

  // wheel: pinch / ctrl+scroll zooms, plain scroll pans
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top);
      else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
        moved.current = true;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // keep the selected entity in view when it is chosen from the list
  useEffect(() => {
    if (showFocus || !selectedId) return;
    const p = positions.get(selectedId);
    if (!p) return;
    const sx = view.x + p.x * view.k;
    const sy = view.y + p.y * view.k;
    if (sx < 20 || sy < 20 || sx + NW * view.k > size.w - 20 || sy + NH * view.k > size.h - 20) {
      setView((v) => ({ ...v, x: size.w / 2 - (p.x + NW / 2) * v.k, y: size.h / 2 - (p.y + NH / 2) * v.k }));
      moved.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, positions, showFocus, size.w, size.h, view.x, view.y, view.k]);

  const startNodeDrag = (event: React.PointerEvent<SVGGElement>, id: string) => {
    if (showFocus) return;
    const point = positions.get(id);
    if (!point) return;
    nodeDrag.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, ox: point.x, oy: point.y, moved: false };
    setDraggingNode(id);
    wrapRef.current?.setPointerCapture?.(event.pointerId);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("[data-node],[data-control]")) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, id: e.pointerId };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const card = nodeDrag.current;
    if (card) {
      const dx = (e.clientX - card.x) / view.k;
      const dy = (e.clientY - card.y) / view.k;
      if (Math.abs(dx) + Math.abs(dy) > 2) card.moved = true;
      const maxX = Math.max(12, overview.width - NW - 12);
      const maxY = Math.max(LAYOUT.header + LAYOUT.pad, overview.height - NH - 12);
      const x = Math.max(12, Math.min(maxX, card.ox + dx));
      const y = Math.max(LAYOUT.header + LAYOUT.pad, Math.min(maxY, card.oy + dy));
      setManualPositions((current) => {
        const next = new Map(current);
        next.set(card.id, { x, y });
        return next;
      });
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      moved.current = true;
      setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const card = nodeDrag.current;
    if (card) {
      nodeDrag.current = null;
      setDraggingNode(null);
      if (card.moved) {
        suppressCardAction.current = true;
        setManualPositions((current) => {
          const point = current.get(card.id);
          if (!point) return current;
          const next = new Map(current);
          next.set(card.id, { x: Math.round(point.x / 8) * 8, y: Math.round(point.y / 8) * 8 });
          return next;
        });
        window.setTimeout(() => { suppressCardAction.current = false; }, 0);
      }
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) <= 3) onSelect(null);
  };

  // ── derived highlighting ──
  const active = hovered ?? selectedId;
  const activeNeighbors = useMemo(() => {
    const set = new Set<string>();
    if (!active) return set;
    set.add(active);
    for (const e of model.adjacency.get(active) ?? []) set.add(e.source === active ? e.target : e.source);
    return set;
  }, [active, model]);
  const pathSet = useMemo(() => new Set(pathNodes), [pathNodes]);
  const pathEdgeIds = useMemo(() => new Set(pathEdges.map((e) => e.id)), [pathEdges]);
  const hasPath = pathNodes.length > 1;

  const stateFor = (id: string): CardState => ({
    selected: id === selectedId,
    hovered: id === hovered,
    dimmed: hasPath ? !pathSet.has(id) : active != null && !activeNeighbors.has(id),
    matched: searchMatches.has(id),
    onPath: pathSet.has(id),
    picking,
    dragging: draggingNode === id,
  });
  const selectCard = (id: string) => {
    if (!suppressCardAction.current) onSelect(id);
  };
  const openCard = (id: string) => {
    if (!suppressCardAction.current) onOpen(id);
  };

  const grid = (
    <pattern id="mc-dots" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.2" fill="var(--border-dim)" />
    </pattern>
  );

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-[var(--bg-surface)]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
        nodeDrag.current = null;
        setDraggingNode(null);
      }}
      style={{ cursor: drag.current ? "grabbing" : "grab" }}
    >
      <svg width="100%" height="100%" role="img" aria-label="Connection map" className="block">
        <defs>
          {grid}
          {[
            ["mc-arrow", "var(--text-muted)"],
            ["mc-arrow-active", "var(--accent)"],
            ["mc-arrow-path", "var(--warning)"],
          ].map(([id, fill]) => (
            <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill={fill} />
            </marker>
          ))}
        </defs>
        <rect width="100%" height="100%" fill="url(#mc-dots)" opacity="0.7" />

        <g data-map-content transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {!showFocus && (
            <>
              {overview.lanes.map((lane) => {
                const meta = LANE_META[lane.key];
                return (
                  <g key={lane.key} data-lane={lane.key}>
                    <rect x={lane.x} y={lane.y} width={lane.width} height={lane.height} rx={16} fill="var(--bg-raised)" stroke="var(--border-dim)" strokeWidth={1.5} opacity={0.9} />
                    <text x={lane.x + 16} y={lane.y + 24} fontSize={12} fontWeight={800} fill="var(--text-primary)" letterSpacing="0.04em" style={{ textTransform: "uppercase" }}>
                      {meta.short}
                    </text>
                    <text x={lane.x + 16} y={lane.y + 41} fontSize={11} fontWeight={700} fill="var(--text-muted)">
                      {lane.total} {lane.total === 1 ? "entity" : "entities"}
                      {lane.hidden > 0 ? ` · showing ${lane.shown}` : ""}
                    </text>
                    {lane.total > LAYOUT.capCollapsed && (
                      <g data-control transform={`translate(${lane.x + lane.width - 16},${lane.y + 30})`} style={{ cursor: "pointer" }} role="button" tabIndex={0} aria-label={lane.expanded ? "Show fewer" : "Show more"} onClick={() => onToggleLane(lane.key)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggleLane(lane.key)}>
                        <rect x={-64} y={-12} width={64} height={22} rx={11} fill="var(--bg-surface)" stroke="var(--border-subtle)" />
                        <text x={-32} y={3} textAnchor="middle" fontSize={11} fontWeight={800} fill="var(--accent-text)">
                          {lane.expanded ? "Show less" : "Show more"}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {visibleEdges(model, positions, new Set(active ? [active] : [])).map((edge) => {
                const a = positions.get(edge.source)!;
                const b = positions.get(edge.target)!;
                // Manual movement can place a card outside its original lane,
                // so anchors follow the card's physical position.
                const same = a.lane === b.lane && Math.abs(a.x - b.x) < NW * 0.6;
                const forward = a.x <= b.x;
                const from = same ? { x: a.x + NW, y: a.y + NH / 2 } : forward ? { x: a.x + NW, y: a.y + NH / 2 } : { x: a.x, y: a.y + NH / 2 };
                const to = same ? { x: b.x + NW, y: b.y + NH / 2 } : forward ? { x: b.x, y: b.y + NH / 2 } : { x: b.x + NW, y: b.y + NH / 2 };
                const g = same ? arc(from, to) : curve(from, to);
                const onPath = hasPath && pathEdgeIds.has(edge.id);
                const incident = active != null && (edge.source === active || edge.target === active);
                const tone = onPath ? "path" : incident ? "active" : "normal";
                const dimmed = hasPath ? !onPath : active != null && !incident;
                const srcCat = model.nodes.get(edge.source)?.category ?? "OTHER";
                return (
                  <g key={edge.id}>
                    <EdgeLine d={g.d} edge={edge} sourceColor={CATEGORY_STYLE[srcCat].color} tone={tone} dimmed={dimmed} />
                    {(onPath || (incident && (model.adjacency.get(active!)?.length ?? 0) <= 10)) && <EdgeLabel x={g.mid.x} y={g.mid.y} text={edge.label} tone={onPath ? "path" : "active"} />}
                  </g>
                );
              })}

              {[...positions.entries()].map(([id, p]) => {
                const node = model.nodes.get(id);
                if (!node) return null;
                return <Card key={id} node={node} x={p.x} y={p.y} state={stateFor(id)} onSelect={selectCard} onOpen={openCard} onHover={setHovered} onDragStart={startNodeDrag} />;
              })}

              {overview.lanes
                .filter((l) => l.hidden > 0)
                .map((lane) => {
                  const at = overview.moreAt.get(lane.key)!;
                  return (
                    <g key={`more-${lane.key}`} data-control transform={`translate(${at.x},${at.y})`} style={{ cursor: "pointer" }} role="button" tabIndex={0} aria-label={`Show ${lane.hidden} more`} onClick={() => onToggleLane(lane.key)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggleLane(lane.key)}>
                      <rect width={NW} height={34} rx={10} fill="transparent" stroke="var(--border-strong)" strokeDasharray="5 4" strokeWidth={1.5} />
                      <text x={NW / 2} y={21} textAnchor="middle" fontSize={12} fontWeight={800} fill="var(--text-secondary)">
                        + {lane.hidden} more
                      </text>
                    </g>
                  );
                })}
            </>
          )}

          {showFocus && focus && (
            <>
              {focus.items.map(({ conn, x, y, side }) => {
                const cy = focus.centerY + focus.CH / 2;
                const itemY = y + NH / 2;
                const incoming = side === "left";
                const from = incoming ? { x: x + NW, y: itemY } : { x: focus.centerX + focus.CW, y: cy };
                const to = incoming ? { x: focus.centerX, y: cy } : { x, y: itemY };
                const g = curve(from, to);
                const hot = hovered === conn.node.id;
                return <EdgeLine key={conn.edge.id} d={g.d} edge={conn.edge} sourceColor={CATEGORY_STYLE[focus.center.category].color} tone={hot ? "active" : "normal"} dimmed={hovered != null && !hot} />;
              })}
              {focus.headings.map((h, i) => (
                <g key={`${h.label}-${i}`} transform={`translate(${h.x},${h.y})`}>
                  <rect width={NW} height={22} rx={11} fill={h.weak ? "var(--bg-raised)" : "var(--focus-bg)"} stroke={h.weak ? "var(--border-subtle)" : "var(--focus-ring)"} strokeDasharray={h.weak ? "4 3" : undefined} />
                  <text x={12} y={15} fontSize={11} fontWeight={800} fill={h.weak ? "var(--text-secondary)" : "var(--accent-text)"}>
                    {middleTruncate(h.label, 28)} · {h.total}
                  </text>
                </g>
              ))}
              {focus.items.map(({ conn, x, y }) => (
                <Card key={conn.edge.id + conn.node.id} node={conn.node} x={x} y={y} state={{ ...stateFor(conn.node.id), selected: false, dimmed: hovered != null && hovered !== conn.node.id }} onSelect={onSelect} onOpen={onOpen} onHover={setHovered} />
              ))}
              {focus.notes.map((n, i) => (
                <text key={`note-${i}`} x={n.x + 14} y={n.y + 15} fontSize={11.5} fontWeight={700} fill="var(--text-muted)">
                  + {n.count} more not shown
                </text>
              ))}
              <Card node={focus.center} x={focus.centerX} y={focus.centerY} width={focus.CW} height={focus.CH} state={{ selected: true, hovered: false, dimmed: false, matched: false, onPath: false, picking: false, focusCenter: true }} onSelect={() => undefined} onOpen={() => undefined} onHover={() => undefined} />
            </>
          )}
        </g>
      </svg>

      {model.nodes.size === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="rounded-xl bg-[var(--bg-raised)] px-4 py-3 text-[14px] font-bold text-[var(--text-secondary)]">No connections match the current filters.</p>
        </div>
      )}
      {mode === "focus" && !selectedId && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="rounded-xl bg-[var(--bg-raised)] px-4 py-3 text-[14px] font-bold text-[var(--text-secondary)]">Pick an entity from the list or the map to focus on it.</p>
        </div>
      )}
    </div>
  );
}
