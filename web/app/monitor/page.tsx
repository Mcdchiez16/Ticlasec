"use client";

import { useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { MonitorTable } from "@/components/MonitorTable";
import { CreateMonitorForm } from "@/components/CreateMonitorForm";
import { useMonitors } from "@/hooks/useMonitors";
import { useChannels } from "@/hooks/useChannels";
import { ChannelsPanel } from "@/components/ChannelsPanel";

export default function MonitorPage() {
  const channelState = useChannels();
  const [now, setNow] = useState("");
  useEffect(() => {
    const tick = () => setNow(new Date().toISOString().replace("T", " ").slice(0, 19));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  const {
    monitors,
    total_unacknowledged,
    loading,
    error,
    createMonitor,
    deleteMonitor,
    triggerMonitor,
    refresh,
  } = useMonitors();

  return (
    <div className="relative min-h-screen bg-[var(--bg-void)] font-sans text-[var(--text-primary)] transition-colors pb-24 lg:pb-0 lg:pl-[288px]">
      <AppNav />

      {/* Main content */}
      <main className="relative z-10 mx-auto max-w-[1200px] px-6 pt-10 pb-20 space-y-12">
        {/* Page header */}
        <div className="flex items-end justify-between border-b border-[var(--border-dim)] pb-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">
              Monitoring
            </h1>
            <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent-text)]">
              Continuous dark web monitoring
            </p>
          </div>
          <div className="hidden md:flex flex-col items-end gap-1">
             <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] opacity-50">Current time (UTC)</span>
             <span className="text-[13px] font-extrabold tabular-nums text-[var(--text-secondary)]">{now} Z</span>
          </div>
        </div>

        {/* Section 1 — Active Watches */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              <h2 className="text-[14px] font-extrabold uppercase tracking-wider text-[var(--text-primary)]">Active Watchlists</h2>
            </div>
            <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-tight">
              {loading ? "Loading…" : `${monitors.length} Watchlists`}
            </div>
          </div>

          <div className="min-h-[200px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 dw-card gap-4">
                <div className="h-8 w-8 animate-spin rounded-full border border-[var(--accent)] border-t-transparent shadow-[0_0_15px_var(--accent-dim)]" />
                <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--accent-text)]">Loading watchlists…</span>
              </div>
            ) : error ? (
              <div className="py-12 bg-[var(--danger-dim)] rounded-2xl text-center">
                <p className="text-[12px] font-bold uppercase tracking-widest text-[var(--danger)]">Could not load watchlists: {error}</p>
              </div>
            ) : (
              <MonitorTable
                monitors={monitors}
                onTrigger={triggerMonitor}
                onDelete={deleteMonitor}
                onAlertsAcknowledged={() => void refresh()}
              />
            )}
          </div>
        </section>

        {/* Section 2 — Create New Monitor */}
        <section className="space-y-4 pt-4">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)]" />
            <h2 className="text-[14px] font-extrabold uppercase tracking-wider text-[var(--text-primary)]">New Watchlist</h2>
          </div>
          <CreateMonitorForm onSubmit={createMonitor} connectedProviders={channelState.channels.filter((c) => c.connected && c.configured).map((c) => c.provider)} />
        </section>
        <ChannelsPanel {...channelState} />
      </main>

    </div>
  );
}
