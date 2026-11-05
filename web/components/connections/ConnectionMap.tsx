"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Focus,
  LayoutGrid,
  Maximize2,
  Minus,
  Move,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Route,
  Search,
  X,
} from "lucide-react";
import { CATEGORY_ORDER, type EntityCategoryKey, type GraphApiResponse, type InvestigationEntity } from "@/lib/types/investigation";
import { MapCanvas, type MapMode } from "./MapCanvas";
import { CATEGORY_ICON } from "./icons";
import {
  CATEGORY_STYLE,
  applyFilters,
  buildModel,
  countByCategory,
  focusConnections,
  groupConnections,
  matchesSearch,
  middleTruncate,
  shortestPath,
  type LaneKey,
  type MapNode,
} from "./model";

export interface ConnectionMapProps {
  data: GraphApiResponse | null;
  entities: InvestigationEntity[];
  loading: boolean;
  error: string | null;
  defang: boolean;
  onDefangChange: (value: boolean) => void;
  minConfidence: number;
  onMinConfidenceChange: (value: number) => void;
  strongOnly: boolean;
  onStrongOnlyChange: (value: boolean) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenRecord: (entity: InvestigationEntity) => void;
  onRefresh: () => void;
  refreshing: boolean;
  updatedAt: Date | null;
  onDownloadCsv: () => void;
}

const CONFIDENCE_OPTIONS = [0, 0.5, 0.75, 0.9];

function ago(date: Date | null, now: number): string {
  if (!date) return "not yet loaded";
  const s = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`flex h-9 items-center gap-2 rounded-xl border-2 px-3 text-[12px] font-extrabold transition-colors ${
        active ? "border-[var(--focus-ring)] bg-[var(--focus-bg)] text-[var(--accent-text)]" : "border-[var(--border-dim)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-subtle)]"
      }`}
    >
      <span className={`grid h-4 w-4 place-items-center rounded border-2 ${active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border-strong)]"}`}>{active && <Check className="h-3 w-3" strokeWidth={4} />}</span>
      {children}
    </button>
  );
}

function IconButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="grid h-9 w-9 place-items-center rounded-xl border-2 border-[var(--border-dim)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-subtle)] hover:text-[var(--text-primary)] disabled:opacity-50">
      {children}
    </button>
  );
}

function CategoryDot({ category, size = 28 }: { category: EntityCategoryKey; size?: number }) {
  const Icon = CATEGORY_ICON[category];
  const color = CATEGORY_STYLE[category].color;
  return (
    <span className="grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 16%, var(--bg-surface))`, color }}>
      <Icon style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={2.4} />
    </span>
  );
}

export function ConnectionMap(props: ConnectionMapProps) {
  const { data, entities, loading, error, defang, onDefangChange, minConfidence, onMinConfidenceChange, strongOnly, onStrongOnlyChange, selectedId, onSelect, onOpenRecord, onRefresh, refreshing, updatedAt, onDownloadCsv } = props;

  const [mode, setMode] = useState<MapMode>("overview");
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState<Set<EntityCategoryKey>>(() => new Set());
  const [expandedLanes, setExpandedLanes] = useState<Set<LaneKey>>(() => new Set());
  const [listOpen, setListOpen] = useState(true);
  const [openCats, setOpenCats] = useState<Set<EntityCategoryKey> | null>(null);
  const [showAll, setShowAll] = useState<Set<EntityCategoryKey>>(() => new Set());
  const [pathFrom, setPathFrom] = useState<string | null>(null);
  const [pathTo, setPathTo] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [layoutSignal, setLayoutSignal] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [zoomCommand, setZoomCommand] = useState<{ id: number; dir: 1 | -1 } | null>(null);
  const [copied, setCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setNow(Date.now()), [updatedAt]);

  const base = useMemo(() => buildModel(data, entities, { defang }), [data, entities, defang]);
  const model = useMemo(() => applyFilters(base, { hiddenCategories: hidden, strongOnly, search: "" }), [base, hidden, strongOnly]);
  const counts = useMemo(() => countByCategory(base), [base]);
  const presentCategories = useMemo(() => CATEGORY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0), [counts]);

  const searchMatches = useMemo(() => {
    const set = new Set<string>();
    if (!search.trim()) return set;
    for (const n of model.nodes.values()) if (matchesSearch(n, search)) set.add(n.id);
    return set;
  }, [model, search]);

  const selected = selectedId ? (model.nodes.get(selectedId) ?? base.nodes.get(selectedId) ?? null) : null;
  const picking = pathFrom != null && pathTo == null;
  const pinned = useMemo<ReadonlySet<string>>(() => (pathFrom ? new Set([pathFrom]) : new Set<string>()), [pathFrom]);
  const path = useMemo(() => (pathFrom && pathTo ? shortestPath(model, pathFrom, pathTo) : null), [model, pathFrom, pathTo]);
  const pathMissing = Boolean(pathFrom && pathTo && !path);

  const clearPath = useCallback(() => {
    setPathFrom(null);
    setPathTo(null);
  }, []);

  const handleSelect = useCallback(
    (id: string | null) => {
      if (id && pathFrom && !pathTo) {
        if (id === pathFrom) return;
        setPathTo(id);
        return;
      }
      if (id === null && pathFrom && pathTo) return; // clicking empty space keeps a traced path
      onSelect(id);
    },
    [onSelect, pathFrom, pathTo],
  );

  const handleOpen = useCallback(
    (id: string) => {
      onSelect(id);
      setMode("focus");
    },
    [onSelect],
  );

  const toggleHidden = (c: EntityCategoryKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const toggleLane = useCallback(
    (lane: LaneKey) =>
      setExpandedLanes((prev) => {
        const next = new Set(prev);
        if (next.has(lane)) next.delete(lane);
        else next.add(lane);
        return next;
      }),
    [],
  );

  const isOpenCat = (c: EntityCategoryKey) => (openCats ? openCats.has(c) : (counts.get(c) ?? 0) <= 8);
  const toggleCat = (c: EntityCategoryKey) =>
    setOpenCats((prev) => {
      const next = new Set(prev ?? presentCategories.filter((x) => (counts.get(x) ?? 0) <= 8));
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const membersByCategory = useMemo(() => {
    const map = new Map<EntityCategoryKey, MapNode[]>();
    for (const n of base.nodes.values()) {
      const list = map.get(n.category);
      if (list) list.push(n);
      else map.set(n.category, [n]);
    }
    for (const list of map.values()) list.sort((a, b) => b.strongDegree - a.strongDegree || b.degree - a.degree || a.label.localeCompare(b.label));
    return map;
  }, [base]);

  const reset = () => {
    setHidden(new Set());
    setSearch("");
    setExpandedLanes(new Set());
    clearPath();
    onStrongOnlyChange(false);
    setLayoutSignal((n) => n + 1);
    setFitSignal((n) => n + 1);
  };

  const arrange = () => {
    setLayoutSignal((n) => n + 1);
    setFitSignal((n) => n + 1);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const status = data?.graph_status;
  const confidenceOptions = CONFIDENCE_OPTIONS.includes(minConfidence) ? CONFIDENCE_OPTIONS : [...CONFIDENCE_OPTIONS, minConfidence].sort((a, b) => a - b);
  const connectionGroups = useMemo(() => (selected ? groupConnections(focusConnections(model, selected.id), 6) : []), [model, selected]);
  const listQuery = search.trim().toLowerCase();

  return (
    <div className="flex min-h-0 flex-1 bg-[var(--bg-surface)]">
      {/* ── Entities ─────────────────────────────────────────── */}
      {listOpen ? (
        <aside className="flex w-[296px] shrink-0 flex-col border-r-2 border-[var(--border-dim)] bg-[var(--bg-surface)]" aria-label="Entities">
          <div className="shrink-0 space-y-3 border-b-2 border-[var(--border-dim)] p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-extrabold text-[var(--text-primary)]">Entities</h2>
                <p className="text-[12px] font-semibold text-[var(--text-muted)]">
                  {base.nodes.size} found · {base.edges.length} connections
                </p>
              </div>
              <IconButton label="Hide entity list" onClick={() => setListOpen(false)}>
                <PanelLeftClose className="h-4 w-4" strokeWidth={2.4} />
              </IconButton>
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" strokeWidth={2.4} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find an entity…" aria-label="Find an entity" className="dw-input !h-10 !pl-9 !pr-9 !py-0 text-[13px]" />
              {search && (
                <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-2">
            {presentCategories.length === 0 && <p className="p-4 text-[13px] font-semibold text-[var(--text-muted)]">{loading ? "Loading entities…" : "No entities yet."}</p>}
            {presentCategories.map((c) => {
              const style = CATEGORY_STYLE[c];
              const all = membersByCategory.get(c) ?? [];
              const filtered = listQuery ? all.filter((n) => matchesSearch(n, listQuery)) : all;
              if (listQuery && filtered.length === 0) return null;
              const open = listQuery ? true : isOpenCat(c);
              const limit = showAll.has(c) || listQuery ? 60 : 8;
              const rows = filtered.slice(0, limit);
              const off = hidden.has(c);
              return (
                <section key={c} className="mb-1">
                  <div className="flex items-center gap-1 rounded-xl px-1 py-1 hover:bg-[var(--bg-raised)]">
                    <button type="button" onClick={() => toggleCat(c)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left">
                      {open ? <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" /> : <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />}
                      <CategoryDot category={c} size={22} />
                      <span className={`truncate text-[13px] font-extrabold ${off ? "text-[var(--text-muted)] line-through" : "text-[var(--text-primary)]"}`}>{style.plural}</span>
                      <span className="ml-auto rounded-full bg-[var(--bg-overlay)] px-2 py-0.5 text-[11px] font-extrabold text-[var(--text-secondary)]">{counts.get(c)}</span>
                    </button>
                    <button type="button" onClick={() => toggleHidden(c)} aria-label={off ? `Show ${style.plural} on the map` : `Hide ${style.plural} from the map`} title={off ? "Show on map" : "Hide from map"} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]">
                      {off ? <EyeOff className="h-4 w-4" strokeWidth={2.4} /> : <Eye className="h-4 w-4" strokeWidth={2.4} />}
                    </button>
                  </div>
                  {open && (
                    <ul className="ml-3 border-l-2 border-[var(--border-dim)] pl-2">
                      {rows.map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => handleSelect(n.id)}
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${selectedId === n.id ? "bg-[var(--focus-bg)] ring-2 ring-[var(--focus-ring)]" : "hover:bg-[var(--bg-raised)]"} ${hidden.has(c) ? "opacity-50" : ""}`}
                            title={n.full}
                          >
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-[var(--text-primary)]">{middleTruncate(n.label, 26)}</span>
                            {n.degree > 0 && <span className="shrink-0 text-[11px] font-extrabold tabular-nums text-[var(--text-muted)]">{n.degree}</span>}
                          </button>
                        </li>
                      ))}
                      {filtered.length > rows.length && (
                        <li>
                          <button type="button" onClick={() => setShowAll((p) => new Set(p).add(c))} className="w-full rounded-lg px-2 py-1.5 text-left text-[12px] font-extrabold text-[var(--accent-text)] hover:bg-[var(--bg-raised)]">
                            Show {filtered.length - rows.length} more
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </aside>
      ) : (
        <div className="flex w-12 shrink-0 flex-col items-center border-r-2 border-[var(--border-dim)] bg-[var(--bg-surface)] py-3">
          <IconButton label="Show entity list" onClick={() => setListOpen(true)}>
            <PanelLeftOpen className="h-4 w-4" strokeWidth={2.4} />
          </IconButton>
        </div>
      )}

      {/* ── Map ──────────────────────────────────────────────── */}
      <section className="relative flex min-w-0 flex-1 flex-col" aria-label="Connection map">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b-2 border-[var(--border-dim)] bg-[var(--bg-surface)] px-4 py-2.5">
          <div className="flex rounded-xl bg-[var(--bg-raised)] p-1" role="tablist" aria-label="Map view">
            {([
              { id: "overview" as const, label: "Overview", icon: LayoutGrid },
              { id: "focus" as const, label: "Focus", icon: Focus },
            ]).map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)} className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-extrabold transition-colors ${mode === id ? "bg-[var(--bg-surface)] text-[var(--accent-text)] shadow-sm ring-1 ring-[var(--border-dim)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
                <Icon className="h-4 w-4" strokeWidth={2.4} />
                {label}
              </button>
            ))}
          </div>

          <label className="flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--border-dim)] bg-[var(--bg-surface)] px-3 text-[12px] font-extrabold text-[var(--text-secondary)]">
            Confidence
            <select value={minConfidence} onChange={(e) => onMinConfidenceChange(parseFloat(e.target.value))} className="cursor-pointer bg-transparent font-extrabold text-[var(--text-primary)] outline-none" aria-label="Minimum confidence">
              {confidenceOptions.map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? "Any" : `≥ ${Math.round(v * 100)}%`}
                </option>
              ))}
            </select>
          </label>
          <Chip active={strongOnly} onClick={() => onStrongOnlyChange(!strongOnly)} title="Hide links that only say two things appeared on the same page">
            Direct links only
          </Chip>
          <Chip active={defang} onClick={() => onDefangChange(!defang)} title="Safe display makes addresses non-clickable so they are safer to copy and share">
            Safe display
          </Chip>
          <button type="button" onClick={reset} className="h-9 rounded-xl px-2 text-[12px] font-extrabold text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            Reset
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[12px] font-bold text-[var(--text-muted)] xl:inline" aria-live="polite">
              {model.nodes.size} entities · {model.edges.length} connections
            </span>
            <button type="button" onClick={arrange} className="flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--border-dim)] bg-[var(--bg-surface)] px-3 text-[12px] font-extrabold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-subtle)] hover:text-[var(--text-primary)]" title="Restore the aligned automatic layout">
              <Move className="h-4 w-4" strokeWidth={2.4} />
              <span className="hidden xl:inline">Auto arrange</span>
            </button>
            <IconButton label="Zoom out" onClick={() => setZoomCommand({ id: Date.now(), dir: -1 })}>
              <Minus className="h-4 w-4" strokeWidth={2.6} />
            </IconButton>
            <span className="w-10 text-center text-[12px] font-extrabold tabular-nums text-[var(--text-secondary)]">{Math.round(zoom * 100)}%</span>
            <IconButton label="Zoom in" onClick={() => setZoomCommand({ id: Date.now(), dir: 1 })}>
              <Plus className="h-4 w-4" strokeWidth={2.6} />
            </IconButton>
            <IconButton label="Fit to screen" onClick={() => setFitSignal((n) => n + 1)}>
              <Maximize2 className="h-4 w-4" strokeWidth={2.4} />
            </IconButton>
            <button type="button" onClick={onRefresh} disabled={refreshing} className="btn-dw btn-dw-ghost btn-dw-sm" title="Reload the latest entities and connections">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} strokeWidth={2.6} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* path banner */}
        {(picking || path || pathMissing) && (
          <div className="shrink-0 border-b-2 border-[var(--border-dim)] bg-[var(--warning-dim)] px-4 py-2.5" role="status">
            <div className="flex flex-wrap items-center gap-3">
              <Route className="h-4 w-4 text-[var(--warning)]" strokeWidth={2.6} />
              {picking && <p className="text-[13px] font-extrabold text-[var(--text-primary)]">Click another entity to trace how it connects to {base.nodes.get(pathFrom!)?.label}.</p>}
              {pathMissing && <p className="text-[13px] font-extrabold text-[var(--text-primary)]">No connection found between these two entities with the current filters.</p>}
              {path && (
                <p className="min-w-0 flex-1 text-[13px] font-extrabold text-[var(--text-primary)]">
                  {path.edges.length === 0 ? "Same entity." : `${path.edges.length} step${path.edges.length === 1 ? "" : "s"}: `}
                  {path.nodes.map((id, i) => (
                    <span key={id}>
                      {i > 0 && (
                        <span className="mx-1.5 inline-flex items-center gap-1 text-[var(--warning)]">
                          <ArrowRight className="inline h-3.5 w-3.5" strokeWidth={2.8} />
                          <span className="text-[11px] font-bold text-[var(--text-secondary)]">{path.edges[i - 1]?.label}</span>
                          <ArrowRight className="inline h-3.5 w-3.5" strokeWidth={2.8} />
                        </span>
                      )}
                      {middleTruncate(base.nodes.get(id)?.label ?? id, 22)}
                    </span>
                  ))}
                </p>
              )}
              <button type="button" onClick={clearPath} className="ml-auto h-8 rounded-lg px-3 text-[12px] font-extrabold text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]">
                {picking ? "Cancel" : "Clear path"}
              </button>
            </div>
          </div>
        )}

        <div className="relative flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
          {status === "no_data" ? (
            <EmptyState title="No connections to show" body="This investigation did not collect enough pages to relate entities to each other." />
          ) : status === "skipped_overflow" ? (
            <EmptyState title="Too many connections to draw" body="This investigation has more relationships than can be shown clearly. Use the entity list to browse them, or download the full dataset." action={<button type="button" onClick={onDownloadCsv} className="btn-dw btn-dw-sm">Download CSV</button>} />
          ) : error ? (
            <EmptyState title="Couldn't load the map" body={error} action={<button type="button" onClick={onRefresh} className="btn-dw btn-dw-sm">Try again</button>} />
          ) : (
            <MapCanvas
              model={model}
              mode={mode}
              selectedId={selected ? selected.id : null}
              searchMatches={searchMatches}
              pathNodes={path?.nodes ?? []}
              pathEdges={path?.edges ?? []}
              expandedLanes={expandedLanes}
              pinned={pinned}
              picking={picking}
              fitSignal={fitSignal}
              layoutSignal={layoutSignal}
              onSelect={handleSelect}
              onOpen={handleOpen}
              onToggleLane={toggleLane}
              onZoom={setZoom}
              zoomCommand={zoomCommand}
            />
          )}

          {loading && !data && (
            <div className="absolute inset-0 grid place-items-center bg-[var(--bg-surface)]/80">
              <div className="flex items-center gap-3 rounded-xl bg-[var(--bg-raised)] px-4 py-3 text-[14px] font-extrabold text-[var(--text-secondary)]">
                <RefreshCw className="h-4 w-4 animate-spin" /> Loading connections…
              </div>
            </div>
          )}

          {/* legend */}
          <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1.5 rounded-xl border-2 border-[var(--border-dim)] bg-[var(--bg-surface)]/95 px-3 py-2.5 text-[11.5px] font-bold text-[var(--text-secondary)] shadow-[var(--float-shadow)]">
            <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">How to read this</p>
            <LegendLine solid label="Direct relationship (uses, controls, posted by…)" />
            <LegendLine label="Seen together on the same source" />
            <p className="pt-0.5 text-[11px] text-[var(--text-muted)]">Drag cards to arrange · Drag empty space to pan · Ctrl + scroll to zoom</p>
          </div>

          </div>

          {/* details */}
          {selected && (
            <aside className="m-3 ml-0 flex w-[340px] shrink-0 flex-col max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-10 max-lg:m-3 max-lg:max-w-[calc(100%-24px)] overflow-hidden rounded-2xl border-2 border-[var(--border-dim)] border-b-4 border-b-[var(--edge)] bg-[var(--bg-surface)] shadow-[var(--float-shadow)]" aria-label="Entity details">
              <header className="flex items-start gap-3 border-b-2 border-[var(--border-dim)] p-4">
                <CategoryDot category={selected.category} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: CATEGORY_STYLE[selected.category].color }}>
                    {CATEGORY_STYLE[selected.category].label}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[12.5px] font-bold leading-snug text-[var(--text-primary)]">{selected.full}</p>
                </div>
                <IconButton label="Close details" onClick={() => onSelect(null)}>
                  <X className="h-4 w-4" strokeWidth={2.6} />
                </IconButton>
              </header>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto custom-scrollbar p-4">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Connections" value={String(selected.degree)} />
                  <Stat label="Direct" value={String(selected.strongDegree)} />
                  <Stat label="Confidence" value={selected.confidence != null ? `${Math.round(selected.confidence * 100)}%` : "–"} />
                </div>

                {selected.entity && (
                  <dl className="space-y-1.5 text-[12.5px] font-semibold">
                    {selected.entity.freshness_label && <Meta k="Freshness" v={selected.entity.freshness_label} />}
                    {selected.entity.source_count != null && <Meta k="Seen on" v={`${selected.entity.source_count} source${selected.entity.source_count === 1 ? "" : "s"}`} />}
                    {selected.entity.first_seen_at && <Meta k="First seen" v={new Date(selected.entity.first_seen_at).toLocaleDateString()} />}
                  </dl>
                )}

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setMode(mode === "focus" ? "overview" : "focus")} className="btn-dw btn-dw-ghost btn-dw-sm">
                    <Focus className="h-4 w-4" strokeWidth={2.6} />
                    {mode === "focus" ? "Back to overview" : "Focus"}
                  </button>
                  <button type="button" onClick={() => { setPathTo(null); setPathFrom(selected.id); }} className="btn-dw btn-dw-ghost btn-dw-sm">
                    <Route className="h-4 w-4" strokeWidth={2.6} />
                    Trace a path
                  </button>
                  <button type="button" onClick={() => copy(selected.full)} className="btn-dw btn-dw-ghost btn-dw-sm">
                    {copied ? <Check className="h-4 w-4" strokeWidth={3} /> : <Copy className="h-4 w-4" strokeWidth={2.6} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  {selected.entity && (
                    <button type="button" onClick={() => onOpenRecord(selected.entity!)} className="btn-dw btn-dw-sm">
                      <ExternalLink className="h-4 w-4" strokeWidth={2.6} />
                      Open record
                    </button>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-[13px] font-extrabold text-[var(--text-primary)]">How it connects</h3>
                  {connectionGroups.length === 0 ? (
                    <p className="rounded-xl bg-[var(--bg-raised)] p-3 text-[12.5px] font-semibold text-[var(--text-muted)]">Nothing is linked to this entity with the current filters.</p>
                  ) : (
                    <div className="space-y-3">
                      {connectionGroups.map((g) => {
                        const key = `${selected.id}:${g.label}`;
                        const expanded = moreOpen.has(key);
                        const all = g.items.length + g.hidden;
                        return (
                          <section key={g.label}>
                            <p className={`mb-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${g.weak ? "border border-dashed border-[var(--border-strong)] text-[var(--text-secondary)]" : "bg-[var(--focus-bg)] text-[var(--accent-text)]"}`}>
                              {g.label} · {all}
                            </p>
                            <ul>
                              {(expanded ? g.items : g.items.slice(0, 4)).map((c) => (
                                <li key={c.edge.id + c.node.id}>
                                  <button type="button" onClick={() => onSelect(c.node.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--bg-raised)]" title={c.node.full}>
                                    <CategoryDot category={c.node.category} size={22} />
                                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-[var(--text-primary)]">{middleTruncate(c.node.label, 26)}</span>
                                    <span className="shrink-0 text-[11px] font-bold tabular-nums text-[var(--text-muted)]">{Math.round(c.edge.confidence * 100)}%</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                            {all > 4 && !expanded && (
                              <button type="button" onClick={() => setMoreOpen((p) => new Set(p).add(key))} className="px-2 py-1 text-[12px] font-extrabold text-[var(--accent-text)]">
                                Show {Math.min(all, g.items.length + g.hidden) - 4} more{g.hidden > 0 ? ` (list capped at ${g.items.length})` : ""}
                              </button>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </aside>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t-2 border-[var(--border-dim)] bg-[var(--bg-surface)] px-4 py-2 text-[12px] font-bold text-[var(--text-muted)]">
          <span>
            Updated {ago(updatedAt, now)}
            {data?.total_entities !== undefined && ` · ${data.displayed_entities ?? data.nodes.length} of ${data.filtered_entities ?? data.total_entities} matching entities shown`}
          </span>
          {hidden.size > 0 && <span className="text-[var(--warning)]">{hidden.size} type{hidden.size === 1 ? "" : "s"} hidden</span>}
        </footer>
      </section>
    </div>
  );
}

// ── small parts ─────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--bg-raised)] px-3 py-2">
      <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="mt-0.5 text-[20px] font-black leading-none tabular-nums text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--text-muted)]">{k}</dt>
      <dd className="text-right text-[var(--text-primary)]">{v}</dd>
    </div>
  );
}

function LegendLine({ solid, label }: { solid?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="34" height="10" aria-hidden>
        <line x1="1" y1="5" x2={solid ? 27 : 33} y2="5" stroke={solid ? "var(--entity-threat-actor)" : "var(--border-strong)"} strokeWidth={solid ? 2.6 : 1.6} strokeDasharray={solid ? undefined : "5 4"} strokeLinecap="round" />
        {solid && <path d="M26 1 L33 5 L26 9 z" fill="var(--text-muted)" />}
      </svg>
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="dw-card max-w-md space-y-3 p-6 text-center">
        <h3 className="text-lg font-extrabold text-[var(--text-primary)]">{title}</h3>
        <p className="text-[14px] font-semibold leading-relaxed text-[var(--text-secondary)]">{body}</p>
        {action}
      </div>
    </div>
  );
}
