"use client";

import { useState } from "react";
import type { CreateMonitorInput } from "@/types/monitor";
import { parseMonitorLinks, customIntervalHours } from "@/lib/monitor-input";

type Props = {
  onSubmit: (input: CreateMonitorInput) => Promise<{ error?: string }>;
  connectedProviders?: string[];
};

const INTERVAL_OPTIONS = [
  { label: "24h", value: 24 },
  { label: "48h", value: 48 },
  { label: "72h", value: 72 },
  { label: "Weekly", value: 168 },
];

const ALERT_ON_OPTIONS = [
  { label: "New Results", value: "new_results" },
  { label: "Any Change", value: "any_change" },
  { label: "Any Presence", value: "any_appearance" },
];

export function CreateMonitorForm({ onSubmit, connectedProviders = [] }: Props) {
  const [type, setType] = useState<"keyword" | "url">("keyword");
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [intervalHours, setIntervalHours] = useState(48);
  const [customInterval, setCustomInterval] = useState(false);
  const [customValue, setCustomValue] = useState("45");
  const [customUnit, setCustomUnit] = useState<"minutes" | "hours" | "days">("minutes");
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [alertOn, setAlertOn] = useState("new_results");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    if (!name.trim()) {
      setFormError("Deployment name is required.");
      return;
    }
    if (!query.trim()) {
      setFormError(`${type === "keyword" ? "Search query" : "Target links"} is required.`);
      return;
    }

    let urls: string[] | undefined;
    let frequency = intervalHours;
    try {
      if (type === "url") urls = parseMonitorLinks(query);
      if (customInterval) frequency = customIntervalHours(customValue, customUnit);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Check the links and interval.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setSuccess(false);

    const input: CreateMonitorInput = {
      name: name.trim(),
      type,
      interval_hours: frequency,
      alert_on: alertOn,
      enabled: true,
      connected_channels: selectedChannels.filter((provider) => connectedProviders.includes(provider)),
    };
    if (type === "keyword") {
      input.query = query.trim();
    } else {
      input.urls = urls;
    }

    let result: { error?: string };
    try { result = await onSubmit(input); }
    catch { result = { error: "Could not create the watchlist. Please try again." }; }
    setSubmitting(false);

    if (result.error) {
      setFormError(result.error);
    } else {
      setSuccess(true);
      setName("");
      setQuery("");
      setIntervalHours(48);
      setCustomInterval(false);
      setSelectedChannels([]);
      setAlertOn("new_results");
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="dw-card p-5 sm:p-8 space-y-8"
    >
      <div className="flex flex-wrap gap-2 items-center justify-between border-b border-[var(--border-dim)] pb-4">
        <h3 className="text-xl font-extrabold text-[var(--text-primary)]">Create Watchlist</h3>
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--accent-text)]">Dark web monitoring</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <label className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-secondary)]">Name</label>
            <input
              type="text"
              aria-label="Watchlist name"
              maxLength={255}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Threat Actor Watch"
              className="dw-input h-12 px-4 outline-none"
              disabled={submitting}
            />
          </div>

          {/* Type Selection */}
          <div className="space-y-3">
             <label className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-secondary)]">Monitoring Type</label>
             <div className="flex p-1 bg-[var(--bg-void)] rounded-lg border border-[var(--border-dim)]">
                {(["keyword", "url"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                        setType(t);
                        setQuery("");
                    }}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded transition-all ${
                        type === t ? "bg-[var(--accent)] text-[var(--text-inverse)] shadow-lg" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {t === "keyword" ? "Keyword search" : "URL watch"}
                  </button>
                ))}
             </div>
          </div>

          {/* Query / URL */}
          <div className="space-y-2">
            <label className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-secondary)]">
              {type === "keyword" ? "Search Parameters" : "Target Links"}
            </label>
            {type === "url" ? <>
              <textarea aria-label="Target links" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={"https://example.com/page\nhttp://example.onion/page"} rows={5}
                className="dw-input w-full min-h-32 px-4 py-3 text-sm resize-y" disabled={submitting} />
              <p className="text-xs text-[var(--text-muted)]">One link per line. Up to 25 links per watchlist; duplicates are removed.</p>
            </> : <input
              aria-label="Search parameters"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter search string..."
              className="dw-input h-12 px-4 outline-none"
              disabled={submitting}
            />}
          </div>

          {/* Interval */}
          <div className="space-y-3">
            <label className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-secondary)]">Check Frequency</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setIntervalHours(opt.value); setCustomInterval(false); }}
                  className={`h-9 rounded border text-[11px] font-bold transition-all ${
                    !customInterval && intervalHours === opt.value
                      ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent-text)]"
                      : "border-[var(--border-dim)] bg-[var(--bg-void)] text-[var(--text-muted)] hover:border-[var(--text-secondary)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <button type="button" onClick={() => setCustomInterval(true)} aria-pressed={customInterval}
                className={`h-9 rounded border text-[11px] font-bold ${customInterval ? "border-[var(--accent)] text-[var(--accent-text)] bg-[var(--accent-dim)]" : "border-[var(--border-dim)] text-[var(--text-muted)]"}`}>Custom</button>
            </div>
            {customInterval && <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <input aria-label="Custom interval" type="number" step="any" min="0" value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)} className="dw-input h-11 px-3 min-w-0" disabled={submitting} />
                <select aria-label="Interval unit" value={customUnit} onChange={(e) => setCustomUnit(e.target.value as typeof customUnit)}
                  className="dw-input h-11 px-3 min-w-0" disabled={submitting}>
                  <option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option>
                </select>
              </div>
              <p className="text-xs text-[var(--text-muted)]">30 minutes to 30 days. Each check finishes before another can start.</p>
            </div>}
          </div>
        </div>

        <div className="space-y-6">
          {/* Alert On */}
          <div className="space-y-3">
            <label className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-secondary)]">Trigger Condition</label>
            <div className="space-y-2">
              {ALERT_ON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAlertOn(opt.value)}
                  className={`w-full flex items-center justify-between px-4 h-10 rounded border text-[11px] font-bold transition-all ${
                    alertOn === opt.value
                      ? "border-[var(--accent-border)] bg-[var(--bg-raised)] text-[var(--text-primary)]"
                      : "border-[var(--border-dim)] bg-[var(--bg-void)] text-[var(--text-muted)] hover:border-[var(--text-secondary)]"
                  }`}
                >
                  <span className="uppercase tracking-widest">{opt.label}</span>
                  {alertOn === opt.value && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />}
                </button>
              ))}
            </div>
          </div>

          {/* Connected accounts and outbound delivery */}
          <div className="space-y-3">
            <label className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-secondary)]">Channels</label>
            <p className="text-xs leading-5 text-[var(--text-muted)]">Choose where to receive watchlist alerts. <a href="#channels" className="text-[var(--accent-text)] underline">Connect Telegram or WhatsApp below</a> to also run investigations from chat.</p>
            {(["telegram", "whatsapp"] as const).map((provider) => <label key={provider} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-dim)] px-4 py-3 text-sm">
              <span className="capitalize">{provider} <span className="ml-2 text-xs text-[var(--text-muted)]">{connectedProviders.includes(provider) ? "Connected account" : "Not connected"}</span></span>
              <input type="checkbox" aria-label={`${provider} alerts`} disabled={!connectedProviders.includes(provider) || submitting}
                checked={selectedChannels.includes(provider) && connectedProviders.includes(provider)}
                onChange={(e) => setSelectedChannels((prev) => e.target.checked ? [...prev, provider] : prev.filter((p) => p !== provider))} />
            </label>)}
            <p className="text-xs text-[var(--text-muted)]">WhatsApp QR alerts arrive in Message yourself while your device is connected. Cloud API connections have a 24-hour reply window. All alerts remain available here.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 pt-4 border-t border-[var(--border-dim)]">
        {formError && (
          <div className="p-3 bg-[var(--danger-dim)] rounded-xl text-[12px] text-[var(--danger)] font-extrabold">
            Fault Detected: {formError}
          </div>
        )}
        {success && (
          <div className="p-3 bg-[var(--success-dim)] rounded-xl text-[12px] text-[var(--success-text)] font-extrabold">
            Deployment Successful: Watchpoint active.
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-dw w-full !min-h-12"
        >
          {submitting ? "Creating…" : "Create Watchlist"}
        </button>
      </div>
    </form>
  );
}
