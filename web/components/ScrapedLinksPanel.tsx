"use client";

import { useEffect, useMemo, useState } from "react";

type ScrapedLink = {
  id: string;
  url: string;
  is_onion: boolean;
  scraped_at: string | null;
  posted_at: string | null;
  language: string | null;
  byte_size: number | null;
  content_characters: number;
  entity_count: number;
  source_type: string;
  source_status: string;
  excerpt: string;
};

type LinkResponse = {
  count: number;
  total: number;
  items: ScrapedLink[];
};

function hostFor(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url.split("/")[0] || url;
  }
}

function formatBytes(value: number | null): string {
  if (!value || value < 1) return "Size unavailable";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} KB`;
  return `${value} B`;
}

function formatDate(value: string | null): string {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ScrapedLinksPanel({ investigationId }: { investigationId: string }) {
  const [data, setData] = useState<LinkResponse>({ count: 0, total: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "onion" | "web">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/investigations/${encodeURIComponent(investigationId)}/links?limit=200`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          const detail = typeof payload?.detail === "string" ? payload.detail : payload?.error;
          throw new Error(detail || `Could not load scraped links (${response.status})`);
        }
        if (active) setData(payload);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load scraped links");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [investigationId]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return data.items.filter((item) => {
      if (filter === "onion" && !item.is_onion) return false;
      if (filter === "web" && item.is_onion) return false;
      if (!search) return true;
      return `${item.url} ${item.excerpt} ${item.source_type}`.toLowerCase().includes(search);
    });
  }, [data.items, filter, query]);

  const onionCount = data.items.filter((item) => item.is_onion).length;
  const webCount = data.items.length - onionCount;

  async function copyLink(item: ScrapedLink) {
    await navigator.clipboard?.writeText(item.url);
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId((current) => current === item.id ? null : current), 1600);
  }

  return (
    <section className="h-full min-h-0 overflow-y-auto bg-[var(--bg-void)] custom-scrollbar">
      <div className="sticky top-0 z-20 border-b border-[var(--border-dim)] bg-[var(--bg-surface)]/95 px-5 py-5 backdrop-blur lg:px-8">
        <div className="mx-auto max-w-[1500px]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent-text)]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M10.6 13.4a4 4 0 005.66 0l2.82-2.82a4 4 0 00-5.66-5.66l-1.61 1.61M13.4 10.6a4 4 0 00-5.66 0l-2.82 2.82a4 4 0 005.66 5.66l1.6-1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-[17px] font-bold text-[var(--text-primary)]">Scraped links</h2>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    Every stored page collected for this investigation, with provenance and scrape metadata.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-[280px]">
                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search URL or page content"
                  className="h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-void)] pl-10 pr-3 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)]"
                />
              </div>
              <div className="flex rounded-xl border border-[var(--border-dim)] bg-[var(--bg-raised)] p-1">
                {([
                  ["all", `All ${data.items.length}`],
                  ["onion", `Onion ${onionCount}`],
                  ["web", `Web ${webCount}`],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={`rounded-lg px-3 py-2 text-[10px] font-bold ${filter === value ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8 lg:py-8">
        {onionCount > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-dim)] px-4 py-3">
            <span className="mt-0.5 text-[var(--warning)]">!</span>
            <p className="text-[11px] leading-5 text-[var(--text-secondary)]">
              <strong className="text-[var(--warning)]">Onion links require Tor.</strong> Copy them into Tor Browser; opening them in a normal browser will not work and may weaken operational security.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-3 py-20 text-[12px] text-[var(--text-muted)]">
            <span className="h-4 w-4 animate-spin rounded-full border border-[var(--accent)] border-t-transparent" />
            Loading scraped links…
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-dim)] p-4 text-[12px] text-[var(--danger)]">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border-subtle)] py-16 text-center text-[12px] text-[var(--text-muted)]">
            {data.items.length === 0 ? "No stored scraped pages were found for this investigation." : "No links match the current search and filter."}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((item, index) => (
            <article key={item.id} className="dw-card flex min-w-0 flex-col p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`rounded-lg px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${item.is_onion ? "bg-[#7c3aed]/15 text-[#8b5cf6]" : "bg-[var(--info-dim)] text-[var(--info-text)]"}`}>
                    {item.is_onion ? "Tor" : "Web"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-bold text-[var(--text-primary)]" title={hostFor(item.url)}>{hostFor(item.url)}</p>
                    <p className="mt-0.5 text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Source {index + 1}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--success-dim)] px-2 py-1 text-[9px] font-bold text-[var(--success-text)]">Scraped</span>
              </div>

              {item.is_onion ? (
                <p className="mt-4 break-all rounded-lg bg-[var(--bg-raised)] px-3 py-2.5 font-mono text-[11px] leading-5 text-[var(--accent-text)]">{item.url}</p>
              ) : (
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-4 break-all rounded-lg bg-[var(--bg-raised)] px-3 py-2.5 font-mono text-[11px] leading-5 text-[var(--accent-text)] hover:underline">{item.url}</a>
              )}

              {item.excerpt && (
                <p className="mt-4 line-clamp-4 text-[12px] leading-5 text-[var(--text-secondary)]">{item.excerpt}</p>
              )}

              <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--border-dim)] pt-4 text-[10px] text-[var(--text-muted)] sm:grid-cols-4">
                <span>{formatDate(item.scraped_at)}</span>
                <span>{formatBytes(item.byte_size)}</span>
                <span>{item.entity_count} entities</span>
                <span>{item.language?.toUpperCase() || item.source_type}</span>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button type="button" onClick={() => void copyLink(item)} className="btn-dw btn-dw-ghost btn-dw-sm">
                  {copiedId === item.id ? "Copied" : item.is_onion ? "Copy for Tor" : "Copy link"}
                </button>
                {!item.is_onion && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-dw btn-dw-sm">Open source</a>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
