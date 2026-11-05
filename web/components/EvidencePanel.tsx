"use client";

import { useEffect, useState } from "react";

export type InvestigationEvidence = {
  id: string;
  page_id: string;
  url: string;
  excerpt: string;
  match_type: "direct" | "partial" | "context";
  matched_terms: string[];
  relevance_score: number;
  source_quality: number;
  source_status: string;
  scraped_at: string | null;
  scope_relevance?: {
    score: number;
    level: string;
    matched_signals: string[];
    rationale: string;
  };
};

export function EvidencePanel({ investigationId }: { investigationId: string }) {
  const [items, setItems] = useState<InvestigationEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/investigations/${encodeURIComponent(investigationId)}/evidence?limit=20`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.detail ?? `Error ${response.status}`);
        if (active) setItems(data.items ?? []);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load evidence");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [investigationId]);

  return (
    <section className="flex h-full min-h-0 flex-col border-t border-[var(--border-dim)] bg-[var(--bg-surface)] xl:border-l xl:border-t-0">
      <div className="shrink-0 border-b border-[var(--border-dim)] px-5 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Evidence behind the answer</h2>
            <p className="mt-1.5 max-w-[300px] text-[11px] leading-5 text-[var(--text-muted)]">
              Ranked excerpts the AI is allowed to cite. Scores reflect relevance and completeness—not source credibility or proof.
            </p>
          </div>
          <span className="rounded-full border border-[var(--border-dim)] px-2 py-1 font-mono text-[10px] text-[var(--text-muted)]">
            {items.length} sources
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 custom-scrollbar">
        {loading && (
          <div className="flex items-center gap-2 py-8 text-[11px] text-[var(--text-muted)]">
            <span className="h-3 w-3 animate-spin rounded-full border border-[var(--accent)] border-t-transparent" />
            Ranking evidence…
          </div>
        )}
        {error && <p className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger-dim)] p-3 text-[11px] text-[var(--danger)]">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="py-8 text-center text-[11px] leading-5 text-[var(--text-muted)]">
            No readable page evidence was stored for this investigation.
          </p>
        )}
        {items.map((item) => (
          <article key={item.page_id} className="rounded-xl border border-[var(--border-dim)] bg-[var(--bg-void)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded bg-[var(--accent-dim)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--accent-text)]">{item.id}</span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                  item.match_type === "direct"
                    ? "bg-[var(--success-dim)] text-[var(--success-text)]"
                    : item.match_type === "partial"
                      ? "bg-[var(--warning-dim)] text-[var(--warning)]"
                      : "bg-white/5 text-[var(--text-muted)]"
                }`}>
                  {item.match_type} match
                </span>
              </div>
              <span className="font-mono text-[9px] text-[var(--text-muted)]">{Math.round(item.relevance_score)} relevance</span>
            </div>
            <p className="mt-3 break-all font-mono text-[10px] leading-4 text-[var(--text-secondary)]" title={item.url}>{item.url}</p>
            <p className="mt-3 text-[12px] leading-5 text-[var(--text-secondary)]">{item.excerpt}</p>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border-dim)] pt-2">
              <span className="text-[9px] text-[var(--text-muted)]">
                Evidence score {Math.round(item.source_quality * 100)}% · {item.source_status}
              </span>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(item.url)}
                className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent-text)] hover:underline"
              >
                Copy URL
              </button>
            </div>
            {item.scope_relevance && item.scope_relevance.level !== "global" && (
              <div className="mt-2 dw-card px-2.5 py-2">
                <div className="flex items-center justify-between gap-2 text-[9px] uppercase tracking-wider">
                  <span className="font-bold text-[var(--text-secondary)]">Scope relevance</span>
                  <span className="font-mono text-[var(--accent-text)]">
                    {item.scope_relevance.level} · {Math.round(item.scope_relevance.score)}
                  </span>
                </div>
                {item.scope_relevance.matched_signals.length > 0 && (
                  <p className="mt-1 text-[9px] leading-4 text-[var(--text-muted)]">
                    Signals: {item.scope_relevance.matched_signals.slice(0, 5).join(", ")}
                  </p>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
