"use client";

import { useCallback, useEffect, useState } from "react";

type HealthPayload = {
  status?: string;
  tor?: boolean;
};

export function StatusBar({ stacked = false }: { stacked?: boolean } = {}) {
  const [torOk, setTorOk] = useState<boolean | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) {
        setApiOnline(false);
        setTorOk(false);
        return;
      }
      const data = (await res.json()) as HealthPayload;
      setApiOnline(data.status === "ok");
      setTorOk(Boolean(data.tor));
    } catch {
      setApiOnline(false);
      setTorOk(null);
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), 30_000);
    return () => window.clearInterval(id);
  }, [poll]);

  if (stacked) {
    const dot = (label: string, ok: boolean | null, okText: string) => (
      <span className="flex items-center gap-2" title={`${label}: ${ok === null ? "checking" : ok ? okText : "offline"}`}>
        <span className="text-[12px] font-bold text-[var(--text-secondary)]">{label}</span>
        <span
          role="img"
          aria-label={`${label} ${ok === null ? "checking" : ok ? okText : "offline"}`}
          className={`h-2.5 w-2.5 rounded-full ${ok === null ? "bg-[var(--neutral)]" : ok ? "bg-[var(--success)]" : "bg-[var(--danger)]"}`}
        />
      </span>
    );
    return (
      <div className="flex items-center justify-between gap-4">
        {dot("Tor", torOk, "connected")}
        {dot("API", apiOnline, "online")}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 font-mono text-[11px] font-medium tracking-tight text-[var(--text-muted)]">
      {/* Tor Status */}
      <div className="flex items-center gap-2">
        <span>TOR</span>
        <span 
          className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${
            torOk === null 
              ? "bg-[var(--neutral)]" 
              : torOk 
                ? "bg-[var(--success)] shadow-[0_0_8px_var(--success)] animate-pulse" 
                : "bg-[var(--danger)]"
          }`}
        />
      </div>

      <span className="text-[var(--border-strong)] opacity-30">|</span>

      {/* API Status */}
      <div className="flex items-center gap-2">
        <span>API</span>
        <span 
          className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${
            apiOnline === null 
              ? "bg-[var(--neutral)]" 
              : apiOnline 
                ? "bg-[var(--success)] shadow-[0_0_8px_var(--success)]" 
                : "bg-[var(--danger)]"
          }`}
        />
      </div>
    </div>
  );
}
