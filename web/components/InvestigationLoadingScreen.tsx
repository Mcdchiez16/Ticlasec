"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileText, Fingerprint, Globe, Layers, Network, Radar, Search, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import SentinelScene from "@/components/dark/SentinelScene";
import { useInvestigationActivity, type ActivityEngine, type ActivityEvent } from "@/lib/hooks/useInvestigationActivity";

const STEPS = ["Search", "Scrape", "Extract", "Graph", "Summarize"] as const;

const STEP_MESSAGES = [
  "Searching dark web sources…",
  "Collecting and reading pages…",
  "Extracting entities and indicators…",
  "Mapping relationships…",
  "Preparing your briefing…",
];

// Map API pipeline step (1-13) to display step index (0-4)
function apiStepToDisplayIndex(apiStep: number | null | undefined): number {
  if (!apiStep || apiStep <= 0) return 0;
  if (apiStep <= 2) return 0; // SEARCH
  if (apiStep <= 4) return 1; // SCRAPE
  if (apiStep <= 6) return 2; // EXTRACT
  if (apiStep <= 7) return 3; // GRAPH
  return 4; // SUMMARIZE
}

const KIND_ICON: Record<string, LucideIcon> = {
  stage: Radar,
  query: Search,
  search: Search,
  result: Check,
  found: Globe,
  fetch: FileText,
  extract: Layers,
  entity: Fingerprint,
  enrich: Network,
  crawl: Network,
  summary: Sparkles,
};

// What the pipeline is doing, read from the live feed (the stored step label can lag behind).
function inferStep(events: ActivityEvent[]): number {
  let idx = 0;
  for (const e of events) {
    if (e.kind === "fetch") idx = Math.max(idx, 1);
    else if (e.kind === "extract" || e.kind === "entity" || e.kind === "enrich") idx = Math.max(idx, 2);
    else if (e.kind === "summary") idx = Math.max(idx, 4);
    else if (e.kind === "stage") {
      const t = e.text.toLowerCase();
      if (/scrap|scan:|reading|collecting|^read \d+ page/.test(t)) idx = Math.max(idx, 1);
      else if (/extract|enrich/.test(t)) idx = Math.max(idx, 2);
      else if (/graph/.test(t)) idx = Math.max(idx, 3);
      else if (/summar|finaliz/.test(t)) idx = Math.max(idx, 4);
    }
  }
  return idx;
}

function currentAction(events: ActivityEvent[], fallback: string): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    switch (e.kind) {
      case "fetch":
        return "Reading hidden service pages…";
      case "extract":
      case "entity":
        return "Extracting entities and indicators…";
      case "enrich":
        return "Enriching with threat intelligence…";
      case "summary":
        return "Writing the briefing…";
      case "stage":
        return `${e.text.replace(/[….]+$/, "")}…`;
      case "crawl":
        return "Crawling onion directories…";
      case "search":
      case "result":
      case "found":
      case "query":
        return "Searching Tor engines and collecting sites…";
    }
  }
  return fallback;
}

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="dw-card px-4 py-3">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-[26px] font-black leading-none tabular-nums text-[var(--text-primary)]">{value}</p>
      <p className="mt-1.5 h-4 text-[12px] font-semibold text-[var(--text-muted)]">{sub ?? ""}</p>
    </div>
  );
}

function EngineRow({ engine }: { engine: ActivityEngine }) {
  const s = engine.status;
  const searching = s === "querying";
  const ok = s === "ok";
  const bad = s === "timeout" || s === "error";
  const detail = searching
    ? "Searching…"
    : ok
      ? `${engine.results} result${engine.results === 1 ? "" : "s"}`
      : s === "timeout"
        ? "Timed out"
        : s === "disabled"
          ? "Skipped"
          : s === "no_key"
            ? "No key"
            : "No response";
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          searching ? "animate-pulse bg-[var(--accent)]" : ok ? "bg-[var(--success)]" : bad ? "bg-[var(--warning)]" : "bg-[var(--neutral)]"
        }`}
      />
      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[var(--text-primary)]">{engine.name}</span>
      <span className={`shrink-0 text-[12px] font-bold tabular-nums ${ok ? "text-[var(--success-text)]" : bad ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}`}>{detail}</span>
    </li>
  );
}

function EventRow({ event }: { event: ActivityEvent }) {
  const Icon = event.level === "warn" ? TriangleAlert : (KIND_ICON[event.kind] ?? Radar);
  const tone =
    event.level === "ok" ? "text-[var(--success-text)]" : event.level === "warn" ? "text-[var(--warning)]" : event.level === "error" ? "text-[var(--danger)]" : "text-[var(--text-muted)]";
  return (
    <li className="flex items-start gap-2.5 px-3 py-1.5 [animation:dw-line-in_0.25s_ease-out]">
      <Icon className={`mt-[2px] h-4 w-4 shrink-0 ${tone}`} strokeWidth={2.4} aria-hidden />
      <span className={`min-w-0 flex-1 break-words text-[13px] leading-snug ${event.kind === "stage" ? "font-extrabold text-[var(--text-primary)]" : "font-semibold text-[var(--text-secondary)]"}`}>{event.text}</span>
      <span className="shrink-0 pt-[1px] font-mono text-[11px] tabular-nums text-[var(--text-muted)]">{fmtClock(event.t)}</span>
    </li>
  );
}

interface Props {
  investigationId: string;
  query: string;
  currentStep?: number | null;
  createdAt?: string | null;
  /** counts stored on the investigation record; used when the live feed has not reported them yet */
  entityCount?: number | null;
  pageCount?: number | null;
  onCancelRequest?: () => void;
  cancelling?: boolean;
}

export function InvestigationLoadingScreen({ investigationId, query, currentStep, createdAt, entityCount, pageCount, onCancelRequest, cancelling }: Props) {
  const [noWebGL, setNoWebGL] = useState(false);
  const [dots, setDots] = useState(".");
  const [elapsed, setElapsed] = useState(() => {
    if (!createdAt) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  });
  const activity = useInvestigationActivity(investigationId, true);

  useEffect(() => {
    const a = setInterval(() => setDots((d) => (d.length >= 3 ? "." : d + ".")), 500);
    const b = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  // keep the feed pinned to the newest line unless the reader scrolled up
  const listRef = useRef<HTMLUListElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [activity.events.length]);

  // note how long it has been since the last new event, to explain slow stretches honestly
  const [quietFor, setQuietFor] = useState(0);
  const lastCount = useRef(0);
  const lastChange = useRef(Date.now());
  useEffect(() => {
    if (activity.events.length !== lastCount.current) {
      lastCount.current = activity.events.length;
      lastChange.current = Date.now();
    }
    const i = setInterval(() => setQuietFor(Math.floor((Date.now() - lastChange.current) / 1000)), 1000);
    return () => clearInterval(i);
  }, [activity.events.length]);

  const activeIdx = Math.max(apiStepToDisplayIndex(currentStep), inferStep(activity.events));
  const bubble = currentAction(activity.events, activity.label || STEP_MESSAGES[activeIdx]);
  const c = activity.counts;
  const engines = activity.engines;
  const enginesDone = engines.filter((e) => e.status !== "querying").length;
  const live = activity.loaded && activity.available;
  const num = (v: number | undefined) => (live ? String(v ?? 0) : "–");
  const entities = Math.max(c.entities ?? 0, entityCount ?? 0);
  const pagesRead = Math.max(c.pages_fetched ?? 0, pageCount ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-auto bg-[var(--bg-void)]">
      <div className="flex h-[64px] shrink-0 items-center justify-between border-b-2 border-[var(--border-dim)] px-6">
        <Wordmark size={26} />
        <div className="flex items-center gap-2 rounded-full bg-[var(--warning-dim)] px-3 py-1">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--warning)]" />
          <span className="text-[12px] font-extrabold uppercase tracking-wider text-[var(--warning)]">In progress{dots}</span>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col gap-5 px-6 py-6">
        {/* Header: mascot beside the query, current action and progress */}
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <div className="relative h-[132px] w-[132px] shrink-0">
            {noWebGL ? null : <SentinelScene mode="loading" variant="compact" onUnsupported={() => setNoWebGL(true)} className="absolute inset-0" />}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.15em] text-[var(--text-muted)]">Active investigation</p>
            <h2 className="mt-0.5 break-words text-2xl font-black tracking-tight text-[var(--text-primary)] md:text-[28px]">{query}</h2>
            <p key={bubble} className="mt-1.5 flex items-center justify-center gap-2 text-[14px] font-extrabold text-[var(--accent-text)] [animation:dw-line-in_0.3s_ease-out] sm:justify-start" role="status" aria-live="polite">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--accent)]" />
              {bubble}
            </p>

            <ol className="mt-4 flex items-start justify-center sm:justify-start" aria-label="Investigation progress">
              {STEPS.map((step, i) => {
                const isDone = i < activeIdx;
                const isCurrent = i === activeIdx;
                return (
                  <li key={step} className="flex items-start" aria-current={isCurrent ? "step" : undefined}>
                    <div className="flex w-[58px] flex-col items-center gap-1.5 sm:w-[72px]">
                      <div className={isDone ? "step-node step-done" : isCurrent ? "step-node step-current" : "step-node"}>{isDone ? "✓" : i + 1}</div>
                      <span className={`text-[10px] font-extrabold uppercase tracking-wide sm:text-[11px] sm:tracking-wider ${isDone ? "text-[var(--success-text)]" : isCurrent ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]"}`}>{step}</span>
                    </div>
                    {i < STEPS.length - 1 && <div className={`mt-[16px] h-1 w-3 rounded-full sm:w-6 ${isDone ? "bg-[var(--success)]" : "bg-[var(--border-dim)]"}`} />}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* What it has actually done so far */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Search engines" value={live ? `${enginesDone}/${engines.length}` : "–"} sub={live && engines.length > enginesDone ? `${engines.length - enginesDone} still searching` : live ? "all responded" : undefined} />
          <StatTile label="Sites found" value={num(c.sites ?? c.urls_found)} sub={live && c.urls_found ? `${c.urls_found} links` : undefined} />
          <StatTile label="Pages read" value={live ? String(pagesRead) : "–"} sub={live && c.pages_failed ? `${c.pages_failed} unreachable` : undefined} />
          <StatTile label="Entities" value={live ? String(entities) : "–"} sub={live ? "actors, wallets, indicators" : undefined} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <section className="dw-card flex h-[340px] min-h-0 flex-col overflow-hidden" aria-label="Search engines">
            <header className="flex items-center justify-between border-b-2 border-[var(--border-dim)] px-4 py-3">
              <h3 className="text-[13px] font-extrabold uppercase tracking-wider text-[var(--text-primary)]">Search engines</h3>
              <span className="text-[12px] font-bold text-[var(--text-muted)]">via Tor</span>
            </header>
            {engines.length ? (
              <ul className="flex-1 divide-y divide-[var(--border-dim)] overflow-y-auto">
                {engines.map((e) => (
                  <EngineRow key={e.name} engine={e} />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-[13px] font-semibold text-[var(--text-muted)]">{activity.loaded && !activity.available ? "Engine details aren't available for this run." : "Connecting to Tor and preparing the search…"}</p>
            )}
          </section>

          <section className="dw-card flex h-[340px] min-h-0 flex-col overflow-hidden" aria-label="Live activity">
            <header className="flex items-center justify-between border-b-2 border-[var(--border-dim)] px-4 py-3">
              <h3 className="text-[13px] font-extrabold uppercase tracking-wider text-[var(--text-primary)]">Live activity</h3>
              <span className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-[var(--success-text)]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--success)]" />
                Live
              </span>
            </header>
            {activity.events.length ? (
              <ul
                ref={listRef}
                className="flex-1 overflow-y-auto py-1"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                }}
              >
                {activity.events.map((ev) => (
                  <EventRow key={ev.seq} event={ev} />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-[13px] font-semibold text-[var(--text-muted)]">
                {activity.loaded && !activity.available ? "Live details aren't available for this run. It may have started before the service restarted. Progress above still updates." : "Waiting for the first results…"}
              </p>
            )}
            {live && quietFor >= 20 && (
              <p className="border-t-2 border-[var(--border-dim)] bg-[var(--bg-raised)] px-4 py-2 text-[12px] font-semibold text-[var(--text-muted)]">Still working. Tor engines and hidden services can take 20–30 seconds to answer, and many are slow or offline.</p>
            )}
          </section>
        </div>
      </div>

      <div className="flex min-h-[64px] shrink-0 flex-wrap items-center justify-between gap-3 border-t-2 border-[var(--border-dim)] px-6 py-3">
        <p className="text-[13px] font-extrabold tabular-nums text-[var(--text-muted)]">Elapsed {fmtClock(elapsed)}</p>
        {onCancelRequest && (
          <button onClick={onCancelRequest} disabled={cancelling} className="btn-dw btn-dw-ghost btn-dw-sm !text-[var(--danger)]">
            {cancelling ? "Cancelling…" : "Cancel investigation"}
          </button>
        )}
      </div>

      <style>{`
        .step-node { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--bg-overlay); color: var(--text-muted); font-weight: 900; font-size: 15px; box-shadow: 0 4px 0 var(--edge); }
        .step-done { background: var(--success); color: #fff; box-shadow: 0 4px 0 var(--success-shadow); }
        .step-current { background: var(--accent); color: #fff; box-shadow: 0 4px 0 var(--accent-shadow); animation: step-bounce 1.2s ease-in-out infinite; }
        @keyframes step-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @media (prefers-reduced-motion: reduce) { .step-current { animation: none; } }
      `}</style>
    </div>
  );
}
