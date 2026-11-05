/**
 * Data model and layout for the connection map. Everything here is pure (no React, no DOM), so
 * the map's behaviour is predictable and unit-tested.
 *
 * The map is organised in four lanes, read left to right:
 *   actors → malware & vulnerabilities → identifiers → infrastructure & sources
 * Connections are curves between lanes, so a relationship reads as "this actor uses this malware
 * and this wallet, seen on these sites" instead of a tangle.
 */
import {
  entityTypeToCategory,
  graphNodeTypeToCategory,
  type EntityCategoryKey,
  type GraphApiResponse,
  type GraphEdgeJSON,
  type InvestigationEntity,
} from "@/lib/types/investigation";

export type LaneKey = "actors" | "threats" | "identifiers" | "infrastructure";

export const LANE_ORDER: LaneKey[] = ["actors", "threats", "identifiers", "infrastructure"];

export const LANE_META: Record<LaneKey, { title: string; short: string; hint: string }> = {
  actors: { title: "Actors", short: "Actors", hint: "Threat actors and groups" },
  threats: { title: "Malware & vulnerabilities", short: "Malware & CVEs", hint: "Malware families and CVEs" },
  identifiers: { title: "Identifiers", short: "Identifiers", hint: "Wallets, emails, keys and other handles" },
  infrastructure: { title: "Infrastructure & sources", short: "Infrastructure", hint: "Onion sites, servers, pastes and forums" },
};

export const CATEGORY_LANE: Record<EntityCategoryKey, LaneKey> = {
  THREAT_ACTOR: "actors",
  MALWARE: "threats",
  CVE: "threats",
  WALLET: "identifiers",
  EMAIL: "identifiers",
  PGP_KEY: "identifiers",
  OTHER: "identifiers",
  FORUM: "infrastructure",
  C2_SERVER: "infrastructure",
  PASTE_URL: "infrastructure",
  ONION_URL: "infrastructure",
};

/** Colour tokens (defined for light and dark in globals.css) and short names per category. */
export const CATEGORY_STYLE: Record<EntityCategoryKey, { label: string; plural: string; color: string }> = {
  THREAT_ACTOR: { label: "Threat actor", plural: "Threat actors", color: "var(--entity-threat-actor)" },
  WALLET: { label: "Wallet", plural: "Wallets", color: "var(--entity-wallet)" },
  MALWARE: { label: "Malware", plural: "Malware", color: "var(--entity-malware)" },
  FORUM: { label: "Forum", plural: "Forums", color: "var(--entity-forum)" },
  C2_SERVER: { label: "Server", plural: "Servers", color: "var(--entity-c2)" },
  CVE: { label: "CVE", plural: "CVEs", color: "var(--entity-cve)" },
  PASTE_URL: { label: "Paste", plural: "Pastes", color: "var(--entity-paste)" },
  ONION_URL: { label: "Onion site", plural: "Onion sites", color: "var(--entity-onion)" },
  EMAIL: { label: "Email", plural: "Emails", color: "var(--entity-email)" },
  PGP_KEY: { label: "PGP key", plural: "PGP keys", color: "var(--entity-pgp)" },
  OTHER: { label: "Other", plural: "Other", color: "var(--neutral)" },
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  CO_APPEARED_ON: "Seen together on the same source",
  CO_INVESTIGATION: "Found in the same investigation",
  POSTED_BY: "Posted by",
  LINKED_TO: "Links to",
  MEMBER_OF: "Member of",
  USES: "Uses",
  CLAIMED: "Claimed",
  LIKELY_SAME_ACTOR: "Likely the same actor",
  CONFIRMED_SAME_ACTOR: "Confirmed same actor",
  PAID_TO: "Paid to",
  FUNDED_BY: "Funded by",
  DROPS: "Drops",
  CONTROLS: "Controls",
  TARGETS: "Targets",
  EXPLOITS: "Exploits",
  COMMUNICATES_WITH: "Communicates with",
};

export function relationshipLabel(type: string): string {
  return RELATIONSHIP_LABELS[type] ?? type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** "Seen together" style links say two things appeared near each other, not that one acts on the other. */
export function isWeakType(type: string): boolean {
  return type.startsWith("CO_");
}

const SYMMETRIC = new Set(["LIKELY_SAME_ACTOR", "CONFIRMED_SAME_ACTOR"]);
export function isDirectedType(type: string): boolean {
  return !isWeakType(type) && !SYMMETRIC.has(type);
}

// ── Display helpers ─────────────────────────────────────────────────────────

export function defangText(value: string): string {
  if (value.includes("[.]") || value.includes("[@]")) return value;
  return value
    .replace(/^http/i, "hxxp")
    .replace(/@/g, "[@]")
    .replace(/\./g, "[.]");
}

export function middleTruncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.6);
  const tail = keep - head;
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

const DEFANG_CATEGORIES = new Set<EntityCategoryKey>(["ONION_URL", "PASTE_URL", "C2_SERVER", "EMAIL"]);

/** A readable label: protocol and path trimmed from onion links, defanged when safe display is on. */
export function displayValue(category: EntityCategoryKey, raw: string, defang: boolean, max = 30): string {
  let text = raw.trim();
  if (category === "ONION_URL" || category === "PASTE_URL") {
    text = text.replace(/^hxxps?:\/\//i, "").replace(/^https?:\/\//i, "");
    text = text.replace(/\/.*$/, "");
    // long onion addresses read as `abcdefgh…wxyz[.]onion`: enough to recognise, short enough to scan
    const onion = text.match(/^(.{20,})(\[\.\]|\.)onion$/i);
    if (onion) {
      const id = onion[1];
      return `${id.slice(0, 8)}…${id.slice(-4)}${defang ? "[.]" : "."}onion`;
    }
  }
  if (defang && DEFANG_CATEGORIES.has(category)) text = defangText(text);
  return middleTruncate(text, max);
}

export function fullValue(category: EntityCategoryKey, raw: string, defang: boolean): string {
  const text = raw.trim();
  return defang && DEFANG_CATEGORIES.has(category) ? defangText(text) : text;
}

// ── Model ───────────────────────────────────────────────────────────────────

export interface MapNode {
  id: string;
  label: string;
  full: string;
  category: EntityCategoryKey;
  lane: LaneKey;
  confidence: number | null;
  degree: number;
  /** connections that are direct relationships, not just "seen together" */
  strongDegree: number;
  entity?: InvestigationEntity;
}

export interface MapEdge {
  id: string;
  source: string;
  target: string;
  /** all relationship types between the pair */
  types: string[];
  label: string;
  strong: boolean;
  directed: boolean;
  confidence: number;
}

export interface MapModel {
  nodes: Map<string, MapNode>;
  edges: MapEdge[];
  adjacency: Map<string, MapEdge[]>;
}

export function buildModel(
  data: GraphApiResponse | null,
  entities: InvestigationEntity[],
  opts: { defang: boolean },
): MapModel {
  const nodes = new Map<string, MapNode>();
  const byKey = new Map<string, InvestigationEntity>();
  for (const e of entities) {
    byKey.set(e.graph_node_id, e);
    if (!byKey.has(e.value)) byKey.set(e.value, e);
  }

  for (const n of data?.nodes ?? []) {
    const entity = byKey.get(n.id);
    let category = graphNodeTypeToCategory(n.type);
    if (category === "OTHER" && entity) category = entityTypeToCategory(entity.entity_type);
    const raw = entity?.value ?? n.id;
    nodes.set(n.id, {
      id: n.id,
      label: displayValue(category, raw, opts.defang),
      full: fullValue(category, raw, opts.defang),
      category,
      lane: CATEGORY_LANE[category],
      confidence: entity?.confidence ?? n.confidence ?? null,
      degree: 0,
      strongDegree: 0,
      entity,
    });
  }

  // Merge parallel edges between the same pair into one connection that lists every type.
  const merged = new Map<string, MapEdge>();
  for (const e of data?.edges ?? ([] as GraphEdgeJSON[])) {
    if (!nodes.has(e.source) || !nodes.has(e.target) || e.source === e.target) continue;
    const type = e.type || "LINKED_TO";
    const directed = isDirectedType(type);
    // undirected pairs are keyed order-independently so A–B and B–A merge
    const key = directed ? `${e.source}>${e.target}` : [e.source, e.target].sort().join("~");
    const existing = merged.get(key);
    if (existing) {
      if (!existing.types.includes(type)) existing.types.push(type);
      existing.confidence = Math.max(existing.confidence, e.confidence ?? 0);
      if (!isWeakType(type)) {
        existing.strong = true;
        existing.directed = existing.directed || directed;
      }
    } else {
      merged.set(key, {
        id: key,
        source: e.source,
        target: e.target,
        types: [type],
        label: "",
        strong: !isWeakType(type),
        directed,
        confidence: e.confidence ?? 0,
      });
    }
  }

  const edges = [...merged.values()];
  const adjacency = new Map<string, MapEdge[]>();
  for (const edge of edges) {
    // the label prefers a specific relationship over "seen together"
    const specific = edge.types.filter((t) => !isWeakType(t));
    edge.label = relationshipLabel((specific[0] ?? edge.types[0]) as string);
    for (const id of [edge.source, edge.target]) {
      const node = nodes.get(id)!;
      node.degree += 1;
      if (edge.strong) node.strongDegree += 1;
      const list = adjacency.get(id);
      if (list) list.push(edge);
      else adjacency.set(id, [edge]);
    }
  }
  return { nodes, edges, adjacency };
}

// ── Filtering ───────────────────────────────────────────────────────────────

export interface MapFilters {
  hiddenCategories: ReadonlySet<EntityCategoryKey>;
  /** hide "seen together" links and nodes that only have those */
  strongOnly: boolean;
  search: string;
}

export function otherEnd(edge: MapEdge, id: string): string {
  return edge.source === id ? edge.target : edge.source;
}

export function applyFilters(model: MapModel, filters: MapFilters): MapModel {
  const keepNode = (n: MapNode) => !filters.hiddenCategories.has(n.category);
  const nodes = new Map<string, MapNode>();
  for (const n of model.nodes.values()) if (keepNode(n)) nodes.set(n.id, { ...n, degree: 0, strongDegree: 0 });

  const edges: MapEdge[] = [];
  for (const e of model.edges) {
    if (!nodes.has(e.source) || !nodes.has(e.target)) continue;
    if (filters.strongOnly && !e.strong) continue;
    edges.push(e);
  }
  const adjacency = new Map<string, MapEdge[]>();
  for (const e of edges) {
    for (const id of [e.source, e.target]) {
      const n = nodes.get(id)!;
      n.degree += 1;
      if (e.strong) n.strongDegree += 1;
      const list = adjacency.get(id);
      if (list) list.push(e);
      else adjacency.set(id, [e]);
    }
  }
  // a search never removes nodes; callers use matchesSearch() to highlight and surface matches
  return { nodes, edges, adjacency };
}

export function matchesSearch(node: MapNode, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return false;
  return node.full.toLowerCase().includes(q) || node.label.toLowerCase().includes(q) || CATEGORY_STYLE[node.category].label.toLowerCase().includes(q);
}

// ── Overview layout (lanes) ─────────────────────────────────────────────────

export const LAYOUT = {
  laneWidth: 232,
  laneGap: 120,
  nodeWidth: 208,
  nodeHeight: 42,
  rowGap: 10,
  header: 54,
  pad: 24,
  laneInset: 12,
  capCollapsed: 10,
  capExpanded: 60,
} as const;

export interface LanePlacement {
  key: LaneKey;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  total: number;
  shown: number;
  hidden: number;
  expanded: boolean;
}

export interface NodePlacement {
  x: number;
  y: number;
  lane: LaneKey;
}

export interface Overview {
  lanes: LanePlacement[];
  positions: Map<string, NodePlacement>;
  /** where each lane's "+N more" control sits */
  moreAt: Map<LaneKey, { x: number; y: number }>;
  width: number;
  height: number;
}

function byImportance(a: MapNode, b: MapNode): number {
  return b.strongDegree - a.strongDegree || b.degree - a.degree || (b.confidence ?? 0) - (a.confidence ?? 0) || a.label.localeCompare(b.label);
}

/**
 * Place visible nodes in lanes. Each lane shows its most connected nodes up to a cap, plus anything
 * the reader asked for (the selection, its neighbours, search matches, a traced path), so selecting
 * something always reveals it.
 */
export function layoutOverview(
  model: MapModel,
  opts: { expandedLanes: ReadonlySet<LaneKey>; pinned: ReadonlySet<string> },
): Overview {
  const { laneWidth, laneGap, nodeHeight, rowGap, header, pad, laneInset } = LAYOUT;
  const byLane = new Map<LaneKey, MapNode[]>();
  for (const n of model.nodes.values()) {
    const list = byLane.get(n.lane);
    if (list) list.push(n);
    else byLane.set(n.lane, [n]);
  }

  const lanes: LanePlacement[] = [];
  const positions = new Map<string, NodePlacement>();
  const moreAt = new Map<LaneKey, { x: number; y: number }>();
  let maxHeight = 0;
  let index = 0;

  for (const key of LANE_ORDER) {
    const all = byLane.get(key);
    if (!all || all.length === 0) continue;
    all.sort(byImportance);
    const expanded = opts.expandedLanes.has(key);
    const cap = expanded ? LAYOUT.capExpanded : LAYOUT.capCollapsed;
    const chosen: MapNode[] = [];
    const taken = new Set<string>();
    for (const n of all) {
      if (opts.pinned.has(n.id) && !taken.has(n.id)) {
        chosen.push(n);
        taken.add(n.id);
      }
    }
    for (const n of all) {
      if (chosen.length >= Math.max(cap, taken.size)) break;
      if (!taken.has(n.id)) {
        chosen.push(n);
        taken.add(n.id);
      }
    }
    // Align each lane with the already placed lanes. Sorting connected nodes by
    // the average row of their upstream neighbours removes many avoidable line
    // crossings while keeping disconnected nodes in a stable importance order.
    const upstreamScore = (node: MapNode): number | null => {
      let total = 0;
      let weight = 0;
      for (const edge of model.adjacency.get(node.id) ?? []) {
        const other = edge.source === node.id ? edge.target : edge.source;
        const placed = positions.get(other);
        if (!placed) continue;
        const edgeWeight = edge.strong ? 2 : 1;
        total += placed.y * edgeWeight;
        weight += edgeWeight;
      }
      return weight ? total / weight : null;
    };
    chosen.sort((a, b) => {
      const aa = upstreamScore(a);
      const bb = upstreamScore(b);
      if (aa != null && bb != null && aa !== bb) return aa - bb;
      if (aa != null && bb == null) return -1;
      if (aa == null && bb != null) return 1;
      return byImportance(a, b);
    });

    const x = pad + index * (laneWidth + laneGap);
    const top = pad;
    chosen.forEach((n, row) => {
      positions.set(n.id, { x: x + laneInset, y: top + header + row * (nodeHeight + rowGap), lane: key });
    });
    const hidden = all.length - chosen.length;
    const rows = chosen.length + (hidden > 0 ? 1 : 0);
    const height = header + rows * (nodeHeight + rowGap) + laneInset;
    if (hidden > 0) moreAt.set(key, { x: x + laneInset, y: top + header + chosen.length * (nodeHeight + rowGap) });
    lanes.push({ key, index, x, y: top, width: laneWidth, height, total: all.length, shown: chosen.length, hidden, expanded });
    maxHeight = Math.max(maxHeight, height);
    index += 1;
  }

  // Equal-height lane panels provide one clean visual baseline. Nodes remain
  // top-aligned and the empty space leaves room for manual rearrangement.
  for (const lane of lanes) lane.height = maxHeight;

  return {
    lanes,
    positions,
    moreAt,
    width: pad * 2 + Math.max(0, lanes.length) * laneWidth + Math.max(0, lanes.length - 1) * laneGap,
    height: pad * 2 + maxHeight,
  };
}

/** Which edges to draw in the overview: cross-lane links, direct relationships, and anything touching `focus`. */
export function visibleEdges(model: MapModel, positions: Map<string, NodePlacement>, focus: ReadonlySet<string>): MapEdge[] {
  const out: MapEdge[] = [];
  for (const e of model.edges) {
    const a = positions.get(e.source);
    const b = positions.get(e.target);
    if (!a || !b) continue;
    const touchesFocus = focus.has(e.source) || focus.has(e.target);
    if (a.lane !== b.lane || e.strong || touchesFocus) {
      // same-lane "seen together" links are only drawn for the focus, otherwise a directory page
      // linked to 90 sites would paint a fan across the lane
      if (a.lane === b.lane && !e.strong && !touchesFocus) continue;
      out.push(e);
    }
  }
  return out;
}

// ── Focus layout (one entity and its neighbours) ────────────────────────────

export interface FocusConnection {
  edge: MapEdge;
  node: MapNode;
  incoming: boolean;
}

export interface FocusGroup {
  label: string;
  weak: boolean;
  items: FocusConnection[];
  hidden: number;
}

export function focusConnections(model: MapModel, id: string): FocusConnection[] {
  const list: FocusConnection[] = [];
  for (const edge of model.adjacency.get(id) ?? []) {
    const node = model.nodes.get(otherEnd(edge, id));
    if (!node) continue;
    list.push({ edge, node, incoming: edge.directed ? edge.target === id : false });
  }
  return list.sort(
    (a, b) => Number(b.edge.strong) - Number(a.edge.strong) || b.edge.confidence - a.edge.confidence || b.node.degree - a.node.degree,
  );
}

/** Group a node's connections by what the relationship means, strongest meaning first. */
export function groupConnections(conns: FocusConnection[], perGroup = 12): FocusGroup[] {
  const groups = new Map<string, FocusGroup>();
  for (const c of conns) {
    const key = `${c.edge.label}|${c.incoming ? "in" : "out"}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        label: c.edge.directed ? (c.incoming ? `${c.edge.label} (incoming)` : c.edge.label) : c.edge.label,
        weak: !c.edge.strong,
        items: [],
        hidden: 0,
      };
      groups.set(key, g);
    }
    if (g.items.length < perGroup) g.items.push(c);
    else g.hidden += 1;
  }
  return [...groups.values()].sort((a, b) => Number(a.weak) - Number(b.weak) || b.items.length + b.hidden - (a.items.length + a.hidden));
}

// ── Path finding ────────────────────────────────────────────────────────────

/** Shortest chain of connections between two entities (breadth-first). */
export function shortestPath(model: MapModel, from: string, to: string): { nodes: string[]; edges: MapEdge[] } | null {
  if (from === to) return { nodes: [from], edges: [] };
  if (!model.nodes.has(from) || !model.nodes.has(to)) return null;
  const prev = new Map<string, { id: string; edge: MapEdge }>();
  const seen = new Set<string>([from]);
  const queue: string[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    // prefer direct relationships when several links reach the same entity
    const adj = [...(model.adjacency.get(cur) ?? [])].sort((a, b) => Number(b.strong) - Number(a.strong));
    for (const edge of adj) {
      const next = otherEnd(edge, cur);
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { id: cur, edge });
      if (next === to) {
        const nodes = [to];
        const edges: MapEdge[] = [];
        let at = to;
        while (at !== from) {
          const p = prev.get(at)!;
          edges.unshift(p.edge);
          nodes.unshift(p.id);
          at = p.id;
        }
        return { nodes, edges };
      }
      queue.push(next);
    }
  }
  return null;
}

// ── Counts used by the side panel ───────────────────────────────────────────

export function countByCategory(model: MapModel): Map<EntityCategoryKey, number> {
  const counts = new Map<EntityCategoryKey, number>();
  for (const n of model.nodes.values()) counts.set(n.category, (counts.get(n.category) ?? 0) + 1);
  return counts;
}
