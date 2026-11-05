"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const POLL_MS = 60_000;

/**
 * Navigation link for Monitor with unacknowledged alert count.
 * Polls GET /api/monitors/alerts/count every 60s (Next.js proxy → backend).
 */
export function useAlertCount() {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    const load = () => {

      fetch("/api/monitors/alerts/count", {
        cache: "no-store",
        headers: {

        }
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { total_unacknowledged?: number } | null) => {
          if (cancelled || !data) return;
          setCount(Number(data.total_unacknowledged ?? 0));
        })
        .catch(() => {});
    };

    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return count;
}

export function MonitorNavBadge({ active = false }: { active?: boolean }) {
  const count = useAlertCount();
  return (
    <Link href="/monitor" className="dw-nav-link" aria-current={active ? "page" : undefined}>
      Monitor
      {count > 0 && (
        <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--danger)] px-1.5 text-[11px] font-extrabold leading-none text-white">{count}</span>
      )}
    </Link>
  );
}
