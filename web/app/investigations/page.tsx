"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { InvestigationCard, InvestigationListItem } from "@/components/InvestigationCard";
import { AppNav } from "@/components/AppNav";

interface InvestigationsResponse {
  items: InvestigationListItem[];
  total: number;
  skip: number;
  limit: number;
}

const LIMIT = 20;

function SkeletonRow() {
  return (
    <div className="dw-card animate-pulse px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="h-5 w-2/3 rounded bg-[var(--bg-raised)]" />
        <div className="h-5 w-20 rounded-full bg-[var(--bg-raised)]" />
      </div>
      <div className="mt-2 h-3 w-1/3 rounded bg-[var(--bg-raised)]" />
    </div>
  );
}

export default function InvestigationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<InvestigationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvestigations = useCallback(async (skipVal: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/investigations?skip=${skipVal}&limit=${LIMIT}`);
      if (!res.ok) throw new Error("Failed to fetch investigations");
      const payload: unknown = await res.json();
      if (!payload || typeof payload !== "object") {
        throw new Error("The investigations service returned an invalid response");
      }

      const data = payload as Partial<InvestigationsResponse>;
      if (!Array.isArray(data.items)) {
        throw new Error("The investigations service returned an invalid list");
      }

      setItems(data.items);
      setTotal(typeof data.total === "number" && Number.isFinite(data.total) ? data.total : data.items.length);
      setSkip(typeof data.skip === "number" && Number.isFinite(data.skip) ? data.skip : skipVal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvestigations(0);
  }, [fetchInvestigations]);

  const currentPage = Math.floor(skip / LIMIT) + 1;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasNext = skip + LIMIT < total;
  const hasPrev = skip > 0;

  const handlePrev = () => {
    if (hasPrev) {
      const newSkip = Math.max(0, skip - LIMIT);
      fetchInvestigations(newSkip);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      fetchInvestigations(skip + LIMIT);
    }
  };

  return (
    <div className="flex min-h-screen flex-col pb-24 lg:pb-0 lg:pl-[288px]">
      <AppNav />

      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">Investigations</h1>
              <p className="mt-1 text-[14px] font-bold text-[var(--text-muted)]">{total} total</p>
            </div>
            <button onClick={() => router.push("/")} className="btn-dw">New investigation</button>
          </div>
          {error && (
            <div className="mb-6 flex items-center justify-between rounded-2xl bg-[var(--danger-dim)] px-4 py-3">
              <span className="text-[13px] text-[var(--danger)]">{error}</span>
              <button
                onClick={() => fetchInvestigations(skip)}
                className="text-[11px] font-semibold text-[var(--danger)] underline"
              >
                Retry
              </button>
            </div>
          )}

          {loading && !error && (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          )}

          {!loading && !error && items.length === 0 && total === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 text-6xl" aria-hidden>🔎</div>
              <h2 className="mb-2 text-[22px] font-extrabold text-[var(--text-primary)]">No investigations yet</h2>
              <p className="mb-6 max-w-sm text-[15px] font-bold text-[var(--text-secondary)]">
                Run your first investigation to start building your intelligence database.
              </p>
              <button
                onClick={() => router.push("/")}
                className="btn-dw"
              >
                New investigation
              </button>
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[12px] text-[var(--text-muted)]">
                  Showing {skip + 1}–{Math.min(skip + LIMIT, total)} of {total}
                </span>
              </div>

              <div className="space-y-3" data-testid="investigations-list">
                {items.map((inv) => (
                  <InvestigationCard
                    key={inv.id}
                    investigation={inv}
                    onClick={() => router.push(`/investigations/${inv.id}`)}
                  />
                ))}
              </div>

              <div className="mt-8 flex items-center justify-center gap-4">
                <button
                  onClick={handlePrev}
                  disabled={!hasPrev}
                  className="btn-dw btn-dw-ghost btn-dw-sm"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Previous
                </button>

                <span className="font-mono text-[11px] text-[var(--text-muted)]" data-testid="pagination-info">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  onClick={handleNext}
                  disabled={!hasNext}
                  className="btn-dw btn-dw-ghost btn-dw-sm"
                >
                  Next
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
