"use client";

import { useEffect, useRef, useState } from "react";

export type ActivityEvent = {
  seq: number;
  t: number;
  kind: string;
  level: "info" | "ok" | "warn" | "error";
  text: string;
  host?: string;
  engine?: string;
};

export type ActivityEngine = {
  name: string;
  status: string;
  results: number;
  ms: number | null;
};

export type ActivityState = {
  /** false until the first response arrives */
  loaded: boolean;
  /** false when the API holds no live feed for this run (e.g. after a restart) */
  available: boolean;
  counts: Record<string, number>;
  engines: ActivityEngine[];
  events: ActivityEvent[];
  label: string;
};

const POLL_MS = 1500;
const MAX_EVENTS = 400;
const EMPTY: ActivityState = { loaded: false, available: true, counts: {}, engines: [], events: [], label: "" };

/** Polls the live activity feed of a running investigation. */
export function useInvestigationActivity(investigationId: string, enabled: boolean): ActivityState {
  const [state, setState] = useState<ActivityState>(EMPTY);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!enabled || !investigationId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const res = await fetch(`/api/investigations/${encodeURIComponent(investigationId)}/activity?after=${seqRef.current}`, { cache: "no-store" });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.available === false) {
            setState((s) => ({ ...s, loaded: true, available: false, label: data.label ?? s.label }));
          } else {
            const seen = seqRef.current;
            // only keep events we have not shown yet (guards against replays)
            const incoming: ActivityEvent[] = (Array.isArray(data.events) ? data.events : []).filter((e: ActivityEvent) => e.seq > seen);
            if (typeof data.seq === "number") seqRef.current = Math.max(seqRef.current, data.seq);
            setState((s) => ({
              loaded: true,
              available: true,
              counts: data.counts ?? s.counts,
              engines: Array.isArray(data.engines) ? data.engines : s.engines,
              events: incoming.length ? [...s.events, ...incoming].slice(-MAX_EVENTS) : s.events,
              label: data.label ?? s.label,
            }));
          }
        }
      } catch {
        /* transient network error: keep the last state and try again */
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };
    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [investigationId, enabled]);

  return state;
}
