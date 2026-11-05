"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ModelSelector } from "@/components/ModelSelector";
import { PRODUCT_NAME } from "@/lib/brand";
import { emitCompanion } from "@/lib/companionBus";
import { classifyQuery, type QueryReading } from "@/lib/classifyQuery";
import { Logo } from "@/components/Logo";
import type { SyntheticScenario } from "@/lib/types/investigation";


const PRESETS = [
  {
    label: "Ransomware Lookup",
    text: "Investigate ransomware group activity, leak sites, and recent victim announcements related to LockBit affiliates.",
  },
  {
    label: "Crypto Trace",
    text: "Trace Bitcoin wallet 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa for dark web mentions and mixer interactions.",
  },
  {
    label: "Threat Actor",
    text: "Build an OSINT profile for threat actor handle 'void_runner' across forums and paste sites.",
  },
  {
    label: "Dark Web Search",
    text: "Search dark web forums and marketplaces for discussions about critical infrastructure attacks in the last 30 days.",
  },
  {
    label: "Entity Map",
    text: "Map all entities, connections, and relationships associated with the Scattered Spider threat group.",
  },
];

const MIN_HEIGHT = 56;
const MAX_HEIGHT = 120;

type InvestigationDepth = "fast" | "standard" | "deep";
type IntelligenceScope = "global" | "zambia" | "custom";
type DataSource = "live" | "synthetic";

const DEPTH_OPTIONS: Array<{
  value: InvestigationDepth;
  label: string;
  description: string;
}> = [
  { value: "fast", label: "Fast", description: "Focused scan · smallest source set" },
  { value: "standard", label: "Standard", description: "Balanced coverage and speed" },
  { value: "deep", label: "Deep", description: "Broad scan · includes crawler" },
];

export type InputState = "idle" | "typing" | "loading" | "error";

export function InvestigationInput({ onStateChange }: { onStateChange?: (state: InputState) => void } = {}) {
  const router = useRouter();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [model, setModel] = useState<string>("");
  const [depth, setDepth] = useState<InvestigationDepth>("standard");
  const [scope, setScope] = useState<IntelligenceScope>("global");
  const [customFocus, setCustomFocus] = useState("");
  const [customKeywords, setCustomKeywords] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [source, setSource] = useState<DataSource>("live");
  const [scenarios, setScenarios] = useState<SyntheticScenario[]>([]);
  const [scenarioId, setScenarioId] = useState("");
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const suggestedQuery = useRef("");

  // Synthetic scenarios are only fetched once someone asks for them.
  useEffect(() => {
    if (source !== "synthetic" || scenarios.length > 0) return;
    let cancelled = false;
    setScenariosError(null);
    fetch("/api/synthetic/scenarios", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Request failed (${res.status})`))))
      .then((data: { items?: SyntheticScenario[] }) => {
        if (cancelled) return;
        const items = data.items ?? [];
        setScenarios(items);
        if (items.length === 0) setScenariosError("No synthetic datasets are available.");
      })
      .catch((e: unknown) => {
        if (!cancelled) setScenariosError(e instanceof Error ? e.message : "Could not load synthetic datasets");
      });
    return () => {
      cancelled = true;
    };
  }, [source, scenarios.length]);

  useEffect(() => {
    const next = loading ? "loading" : error ? "error" : focused ? "typing" : "idle";
    onStateChange?.(next);
    emitCompanion({ type: "state", state: loading ? "loading" : error ? "error" : "idle" });
  }, [loading, error, focused, onStateChange]);

  const adjustHeight = useCallback((reset?: boolean) => {
    const el = taRef.current;
    if (!el) return;
    if (reset) {
      el.style.height = `${MIN_HEIGHT}px`;
      return;
    }
    el.style.height = `${MIN_HEIGHT}px`;
    const next = Math.max(MIN_HEIGHT, Math.min(el.scrollHeight, MAX_HEIGHT));
    el.style.height = `${next}px`;
  }, []);

  useEffect(() => {
    if (taRef.current) taRef.current.style.height = `${MIN_HEIGHT}px`;
  }, []);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  const chooseScenario = (scenario: SyntheticScenario) => {
    setScenarioId(scenario.id);
    // A scenario names the scope it was written for; the Scope box stays editable.
    if (scenario.scope === "zambia" || scenario.scope === "global") setScope(scenario.scope);
    // Offer the dataset's own query, but never overwrite something the user typed.
    if (!value.trim() || value === suggestedQuery.current) {
      suggestedQuery.current = scenario.suggested_query;
      setValue(scenario.suggested_query);
      requestAnimationFrame(() => adjustHeight());
    }
  };

  const handleSubmit = async () => {
    const q = value.trim();
    if (!q || loading) return;
    setError(null);
    setLoading(true);
    try {

      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",

        },
        body: JSON.stringify({
          query: q,
          model,
          depth,
          ...(source === "synthetic" && scenarioId ? { synthetic_scenario: scenarioId } : {}),
          intelligence_scope: {
            profile_id: scope,
            ...(scope === "custom" ? {
              focus_name: customFocus.trim(),
              keywords: customKeywords.split(",").map((item) => item.trim()).filter(Boolean),
            } : {}),
          },
        }),
      });
      const data = (await res.json()) as {
        run_id?: string;
        error?: string;
        detail?: string | { error?: string; message?: string; code?: string };
      };
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        const detail = data.detail;
        if (typeof detail === "object" && detail?.code === "CONTENT_BLOCKED") {
          setError(
            "This search query cannot be processed. " +
            `${PRODUCT_NAME} is designed for legitimate security research only.`
          );
          return;
        }
        setError(
          (typeof detail === "string" ? detail : null) ??
          data.error ??
          `Request failed (${res.status})`
        );
        return;
      }
      if (data.run_id) {
        router.push(`/investigations/${data.run_id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (text: string) => {
    setValue(text);
    setError(null);
    requestAnimationFrame(() => {
      adjustHeight();
      taRef.current?.focus();
    });
  };

  const hasValue = value.trim().length > 0;

  // A quiet, local reading of what was typed (no network call), shown once typing pauses.
  const [reading, setReading] = useState<QueryReading | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setReading(classifyQuery(value)), 450);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* Investigation Container */}
      <div id="investigate-card" className="dw-card group relative w-full transition-colors duration-200 focus-within:border-[var(--focus-ring)]">
        <div className="px-4 pb-4 pt-5 sm:px-5">
          <textarea
            aria-label="Investigation query"
            ref={taRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              adjustHeight();
              emitCompanion({ type: "input", text: e.target.value });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (hasValue) void handleSubmit();
              }
            }}
            onFocus={() => {
              setFocused(true);
              emitCompanion({ type: "focus" });
            }}
            onBlur={() => {
              setFocused(false);
              emitCompanion({ type: "blur" });
            }}
            placeholder="Search for a threat actor, wallet address, malware family, or onion URL..."
            spellCheck={false}
            className="w-full resize-none border-none bg-transparent p-0 text-[16px] font-bold text-[var(--text-primary)] outline-none placeholder:font-semibold placeholder:text-[var(--text-muted)] focus:ring-0"
            style={{ minHeight: MIN_HEIGHT }}
          />
        </div>

        {/* Matching controls with stable columns and labels on their own row. */}
        <div className="grid grid-cols-1 items-end gap-4 border-t border-[var(--border-dim)] px-4 pb-5 pt-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-[minmax(120px,1fr)_minmax(220px,2fr)_minmax(116px,1fr)_auto]">
          <Field label="Scope" htmlFor="investigation-scope">
            <select id="investigation-scope" value={scope} onChange={(event) => setScope(event.target.value as IntelligenceScope)} aria-label="Geographic intelligence scope" className="dw-select min-w-0" title="Focus changes ranking, never hides cross-border evidence.">
              <option value="global">Global</option>
              <option value="zambia">Zambia</option>
              <option value="custom">Custom…</option>
            </select>
          </Field>
          <Field label="Model" htmlFor="model-selector-trigger">
            <ModelSelector value={model} onChange={setModel} />
          </Field>
          <Field label="Depth" htmlFor="investigation-depth">
            <select id="investigation-depth" value={depth} onChange={(event) => setDepth(event.target.value as InvestigationDepth)} aria-label="Investigation depth" className="dw-select min-w-0" title={DEPTH_OPTIONS.find((option) => option.value === depth)?.description}>
              {DEPTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading || !hasValue || (source === "synthetic" && !scenarioId) || (scope === "custom" && !customFocus.trim() && !customKeywords.trim())}
            className="btn-dw h-11 w-full self-end xl:min-w-[152px]"
            aria-busy={loading}
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-[3px] border-[var(--text-inverse)]/50 border-t-transparent" />
            ) : (
              <>Investigate <ArrowRightIcon /></>
            )}
          </button>
        </div>

        <div className="border-t border-[var(--border-dim)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span id="data-source-label" className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Data source</span>
            <div role="radiogroup" aria-labelledby="data-source-label" className="inline-flex rounded-full bg-[var(--bg-raised)] p-1">
              {([
                ["live", "Live dark web"],
                ["synthetic", "Synthetic demo data"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={source === key}
                  onClick={() => setSource(key)}
                  className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold transition-colors ${source === key ? "bg-[var(--bg-surface)] text-[var(--accent-text)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {source === "synthetic" && (
              <span className="text-[12px] font-semibold text-[var(--text-muted)]">Made-up pages, no network traffic. Everything after the search runs as normal.</span>
            )}
          </div>

          {source === "synthetic" && (
            <div className="mt-3">
              {scenariosError ? (
                <p role="alert" className="text-[13px] font-bold text-[var(--danger)]">{scenariosError}</p>
              ) : scenarios.length === 0 ? (
                <p className="text-[13px] font-semibold text-[var(--text-muted)]">Loading datasets…</p>
              ) : (
                <div role="radiogroup" aria-label="Synthetic dataset" className="grid gap-2.5 md:grid-cols-3">
                  {scenarios.map((scenario) => {
                    const selected = scenario.id === scenarioId;
                    return (
                      <button
                        key={scenario.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => chooseScenario(scenario)}
                        className={`flex flex-col gap-1 rounded-2xl border-2 px-3.5 py-3 text-left transition-colors ${selected ? "border-[var(--focus-ring)] bg-[var(--focus-bg)]" : "border-[var(--border-dim)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]"}`}
                      >
                        <span className="text-[13.5px] font-extrabold text-[var(--text-primary)]">{scenario.title}</span>
                        <span className="text-[12px] font-semibold leading-snug text-[var(--text-secondary)]">{scenario.description}</span>
                        <span className="mt-0.5 text-[11px] font-bold text-[var(--text-muted)]">{scenario.pages} pages{scenario.builtin ? "" : " · custom"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {scenarios.find((scenario) => scenario.id === scenarioId)?.highlights.length ? (
                <div className="mt-3 rounded-xl bg-[var(--bg-raised)] px-3.5 py-2.5">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">What to look for</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] font-semibold text-[var(--text-secondary)]">
                    {scenarios.find((scenario) => scenario.id === scenarioId)?.highlights.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {scope === "custom" && (
          <div className="grid gap-4 border-t border-[var(--border-dim)] px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:px-5">
            <Field label="Country or region" htmlFor="investigation-custom-focus">
              <input id="investigation-custom-focus" value={customFocus} onChange={(event) => setCustomFocus(event.target.value)} maxLength={80} placeholder="e.g. Southern Africa" className="dw-input !h-11 !py-0 text-[13px]" />
            </Field>
            <Field label="Additional keywords (optional)" htmlFor="investigation-custom-keywords">
              <input id="investigation-custom-keywords" value={customKeywords} onChange={(event) => setCustomKeywords(event.target.value)} maxLength={400} placeholder="Separate keywords with commas" className="dw-input !h-11 !py-0 text-[13px]" />
            </Field>
          </div>
        )}
      </div>

      <div className="min-h-[42px] w-full" aria-live="polite">
        {reading && !error && (
          <p className="flex items-center gap-2.5 rounded-xl bg-[var(--bg-raised)] px-4 py-2.5 text-[13px] font-semibold text-[var(--text-secondary)] [animation:dw-line-in_0.25s_ease-out]">
            <Logo variant="mark" height={20} title="" />
            <span>
              <span className="font-extrabold text-[var(--text-primary)]">{reading.label}</span>
              <span className="mx-1.5 text-[var(--text-muted)]">·</span>
              {reading.message}
            </span>
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="flex w-full items-center gap-2 rounded-2xl bg-[var(--danger-dim)] px-4 py-3 text-[14px] font-extrabold text-[var(--danger)]">
          <span aria-hidden>✕</span>
          <span>{error}</span>
        </div>
      )}

      {/* Preset shortcuts */}
      <div className="flex flex-wrap items-center justify-center gap-2 px-4">
        {PRESETS.map((p) => (
          <div key={p.label} className="flex items-center">
            <button
              type="button"
              onClick={() => applyPreset(p.text)}
              className="rounded-full bg-[var(--bg-raised)] px-3.5 py-1.5 text-[12px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--focus-bg)] hover:text-[var(--accent-text)]"
            >
              {p.label}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">{label}</label>
      {children}
    </div>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 8h9M9 4.5l4.5 3.5-4.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
