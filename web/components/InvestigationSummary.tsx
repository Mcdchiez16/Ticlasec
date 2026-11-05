"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { SyntheticBadge } from "@/components/SyntheticBadge";
import { InvestigationSummary as Inv } from "@/lib/types/investigation";
import { PRODUCT_NAME, PRODUCT_SLUG } from "@/lib/brand";

interface Props {
  investigation: Inv;
  investigationParamId: string;
  entityCount: number;
  relationshipCount: number;
  pagesCrawled: number;
  lastUpdatedLabel: string;
}

function parseModelDisplayName(modelId: string): string {
  let name = modelId.replace(/^openrouter\//, "");
  const lastSlash = name.lastIndexOf("/");
  if (lastSlash !== -1) name = name.slice(lastSlash + 1);
  name = name.replace(/-openrouter$/, "");
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status }: { status: string }) {
  const isProcessing = status === "processing" || status === "pending";
  const isFailed = status === "failed";
  const isNoResults = status === "completed_no_results";
  const isCancelled = status === "cancelled";

  const baseDot = "h-1.5 w-1.5 rounded-full";
  const baseLabel = "text-[11px] font-extrabold uppercase tracking-wider";

  if (isProcessing) {
    return (
      <div className="flex items-center gap-2 rounded-full px-3 py-1 bg-[var(--warning-dim)]">
        <span className={`${baseDot} bg-[var(--warning)] animate-pulse`} />
        <span className={`${baseLabel} text-[var(--warning)]`}>Running</span>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="flex items-center gap-2 rounded-full px-3 py-1 bg-[var(--warning-dim)]">
        <span className={`${baseDot} bg-[var(--warning)]`} />
        <span className={`${baseLabel} text-[var(--warning)]`}>Cancelled</span>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="flex items-center gap-2 rounded-full px-3 py-1 bg-[var(--danger-dim)]">
        <span className={`${baseDot} bg-[var(--danger)]`} />
        <span className={`${baseLabel} text-[var(--danger)]`}>Failed</span>
      </div>
    );
  }

  if (isNoResults) {
    return (
      <div className="flex items-center gap-2 rounded-full px-3 py-1 bg-[var(--bg-raised)]">
        <span className={`${baseDot} bg-[var(--neutral)]`} />
        <span className={`${baseLabel} text-[var(--text-muted)]`}>No results</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full px-3 py-1 bg-[var(--success-dim)]">
      <span className={`${baseDot} bg-[var(--success)]`} />
      <span className={`${baseLabel} text-[var(--success-text)]`}>Complete</span>
    </div>
  );
}

const EXPORT_FORMATS = [
  { key: "stix",  label: "STIX 2.1",     ext: "json", desc: "Structured threat intel" },
  { key: "misp",  label: "MISP",          ext: "json", desc: "Event sharing format"    },
  { key: "sigma", label: "Sigma Rules",   ext: "zip",  desc: "Detection rule archive"  },
] as const;

export function InvestigationSummary({
  investigation,
  investigationParamId,
  entityCount,
  relationshipCount,
  pagesCrawled,
}: Props) {
  const [exportOpen, setExportOpen]   = useState(false);
  const [exporting,  setExporting]    = useState<string | null>(null);
  const dropdownRef                   = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function handleExport(format: "stix" | "misp" | "sigma") {
    setExporting(format);
    setExportOpen(false);
    try {

      const res = await fetch(
        `/api/export/${encodeURIComponent(investigationParamId)}/${format}`,
        { headers: {} }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext  = format === "sigma" ? "zip" : "json";
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${PRODUCT_SLUG}_${investigationParamId}_${format}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(null);
    }
  }

  return (
    <header className="flex min-h-[72px] shrink-0 items-center justify-between gap-5 border-b border-[var(--border-dim)] bg-[var(--bg-raised)] px-5 py-3 lg:px-8">
      <div className="flex min-w-0 items-center gap-4 lg:gap-6">
        <Wordmark size={26} />

        <div className="hidden h-8 w-px bg-[var(--border-dim)] sm:block" />

        <div className="flex min-w-0 items-center gap-2 text-[12px] font-bold tracking-tight lg:gap-3">
          <div className="hidden items-center gap-1.5 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-surface)] px-3 py-2 md:flex">
            <span className="text-[var(--text-muted)]">ID:</span>
            <span className="text-[var(--text-secondary)] uppercase">{String(investigation.id).slice(0, 8)}</span>
          </div>
          {investigation.synthetic && <SyntheticBadge title={investigation.synthetic.title} />}
          <div className="flex items-center divide-x divide-[var(--border-dim)] rounded-lg border border-[var(--border-dim)] bg-[var(--bg-surface)] px-1 py-1">
            {[
              [entityCount, "Entities"],
              [relationshipCount, "Edges"],
              [pagesCrawled, "Pages"],
            ].map(([value, label]) => (
              <div key={label} className="flex items-baseline gap-1.5 px-2 py-1 lg:px-3">
                <span className="text-[13px] font-extrabold text-[var(--text-primary)]">{value}</span>
                <span className="hidden text-[9px] uppercase tracking-wider text-[var(--text-muted)] sm:inline">{label}</span>
              </div>
            ))}
          </div>
          {investigation.model_used && (
            <div className="hidden max-w-[220px] items-center gap-1.5 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-surface)] px-3 py-2 xl:flex">
              <span className="shrink-0 text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Model</span>
              <span className="truncate text-[11px] text-[var(--text-secondary)]" title={investigation.model_used}>
                {parseModelDisplayName(investigation.model_used)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <StatusBadge status={investigation.status} />

        <div className="hidden h-6 w-px bg-[var(--border-dim)] sm:block" />

        {/* Export dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setExportOpen((v) => !v)}
            disabled={!!exporting}
            className="btn-dw btn-dw-ghost btn-dw-sm"
          >
            {exporting ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    border: "2px solid var(--border-dim)",
                    borderTopColor: "var(--info)",
                    animation: "spin 0.8s linear infinite",
                    flexShrink: 0,
                  }}
                />
                Exporting…
              </>
            ) : (
              <>
                Export Archive
                <svg
                  width="10" height="10" viewBox="0 0 16 16" fill="none"
                  className="opacity-50"
                  style={{ transform: exportOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </button>

          {exportOpen && (
            <div
              className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[180px] overflow-hidden dw-card shadow-xl"
              style={{ backdropFilter: "blur(12px)" }}
            >
              {EXPORT_FORMATS.map(({ key, label, ext, desc }) => (
                <button
                  key={key}
                  onClick={() => void handleExport(key)}
                  className="flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-[var(--bg-overlay)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-[var(--text-primary)]">{label}</span>
                    <span className="rounded bg-[var(--bg-raised)] px-1.5 py-px text-[9px] uppercase text-[var(--text-muted)]">.{ext}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)]">{desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </header>
  );
}
