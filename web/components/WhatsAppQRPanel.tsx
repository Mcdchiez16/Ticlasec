"use client";

import { useEffect, useRef, useState } from "react";
import type { Channel } from "@/hooks/useChannels";

type Session = { status: string; qr_data_url?: string | null; qr_expires_at?: number; error?: string | null; identity?: string | null };
type Props = { channel: Channel; consent: boolean; model: string; refresh: () => Promise<void> };
const labels: Record<string, string> = {
  disconnected: "Not connected", connecting: "Preparing QR…", awaiting_scan: "Scan to connect",
  reconnecting: "Reconnecting…", connected: "Connected", error: "Needs attention", unavailable: "Service unavailable",
};

export function WhatsAppQRPanel({ channel, consent, model, refresh }: Props) {
  const [ack, setAck] = useState(false);
  const [session, setSession] = useState<Session>({ status: channel.connection_status || "disconnected" });
  const [watching, setWatching] = useState(Boolean(channel.has_session));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  const mounted = useRef(true);
  const wasConnected = useRef(channel.connected);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => {
    if (channel.has_session) setWatching(true);
  }, [channel.has_session]);
  useEffect(() => {
    if (!watching) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const version = generation.current;
      try {
        const response = await fetch("/api/channels/whatsapp/qr", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "WhatsApp service unavailable.");
        if (controller.signal.aborted || version !== generation.current) return;
        setSession(data);
        const connected = data.status === "connected";
        if (wasConnected.current !== connected) { wasConnected.current = connected; void refresh(); }
      } catch (error) {
        if (controller.signal.aborted || version !== generation.current) return;
        setSession({ status: "unavailable", error: error instanceof Error ? error.message : "Could not check the connection." });
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 2500);
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [watching, refresh]);
  useEffect(() => {
    if (!session.qr_data_url) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session.qr_data_url]);

  async function start() {
    const version = ++generation.current;
    setBusy(true); setMessage(""); setSession({ status: "connecting" });
    try {
      const response = await fetch("/api/channels/whatsapp/qr", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consent, unofficial_ack: ack, model }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not start QR pairing.");
      if (!mounted.current || version !== generation.current) return;
      setNow(Date.now()); setSession(data); setWatching(true);
      void refresh();
    } catch (error) {
      if (mounted.current && version === generation.current) setSession({ status: "error", error: error instanceof Error ? error.message : "Could not start pairing." });
      // A failed bridge request can still leave a pending session. Expose Disconnect.
      if (mounted.current) void refresh();
    } finally { if (mounted.current && version === generation.current) setBusy(false); }
  }
  async function disconnect() {
    const version = ++generation.current;
    setBusy(true); setWatching(false); setSession({ status: "disconnected" }); setMessage("");
    try {
      const response = await fetch("/api/channels/whatsapp", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not disconnect. Try again or unlink this device on your phone.");
      if (!mounted.current || version !== generation.current) return;
      wasConnected.current = false;
      setMessage("Chat access revoked. Device logout is queued. You can also remove this device immediately in WhatsApp → Linked devices.");
      await refresh();
    } catch (error) {
      if (mounted.current) { setMessage(error instanceof Error ? error.message : "Could not disconnect."); setWatching(true); }
    } finally { if (mounted.current && version === generation.current) setBusy(false); }
  }

  const connected = session.status === "connected";
  const pairing = ["connecting", "awaiting_scan", "reconnecting"].includes(session.status);
  const remaining = Math.max(0, Math.ceil(((session.qr_expires_at || 0) * 1000 - now) / 1000));
  const image = remaining > 0 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(session.qr_data_url || "") ? session.qr_data_url : null;
  return <article className="min-w-0 rounded-xl border border-[var(--border-dim)] p-5 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-lg font-bold">WhatsApp</h3><p className="mt-1 text-xs text-[var(--text-muted)]">Scan a QR code · No Meta API setup</p></div>
      <span role="status" className={`rounded-full px-3 py-1 text-xs font-semibold ${connected ? "bg-[var(--success-dim)] text-[var(--success-text)]" : "bg-[var(--bg-void)] text-[var(--text-muted)]"}`}>{labels[session.status] || "Not connected"}</span>
    </div>
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-[var(--text-muted)]">
      <strong className="font-semibold text-[var(--text-primary)]">Experimental, unofficial connection.</strong> WhatsApp can change or restrict this integration, including your account. A linked device has access to your WhatsApp account; use a dedicated test number for your project. TiclaSec processes commands only in Message yourself, not other conversations.
    </div>
    {!connected && <label className="flex items-start gap-3 text-sm leading-6">
      <input type="checkbox" className="mt-1.5 shrink-0" checked={ack} onChange={e => setAck(e.target.checked)} />
      <span>I understand the unofficial-client risks and allow this server to store my encrypted linked-device session until I disconnect.</span>
    </label>}
    {connected ? <div className="rounded-lg bg-[var(--success-dim)] p-4 text-sm leading-6 space-y-2">
      <p className="font-semibold">Linked account {session.identity || channel.identity}</p>
      <p>Open <strong>Message yourself</strong> in WhatsApp and send <code className="select-all font-bold">/ticla help</code>.</p>
      <p className="text-xs">Investigation model: {channel.model || model}. Reconnect to change it.</p>
    </div> : <>
      {image ? <div className="flex flex-col items-center gap-3 rounded-xl bg-[var(--bg-void)] p-4">
        {/* QR data stays in memory; no remote image service or browser storage. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} width={256} height={256} className="max-w-full rounded-lg bg-white" alt="Private WhatsApp device-pairing QR code. Do not share." />
        <p role="status" className="text-xs text-[var(--text-muted)]">Refreshes automatically · current code expires in {remaining}s</p>
        <p className="text-xs font-semibold">Keep this QR private. Only scan it with your own account.</p>
      </div> : pairing && <p role="status" className="rounded-lg bg-[var(--bg-void)] p-4 text-sm">{session.status === "awaiting_scan" ? "Waiting for a fresh QR code…" : "Connecting to WhatsApp…"}</p>}
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--text-muted)]">
        <li>Click <strong>Show WhatsApp QR</strong> below.</li>
        <li>On your phone, open WhatsApp → <strong>Settings</strong> (or ⋮) → <strong>Linked devices</strong> → <strong>Link a device</strong>.</li>
        <li>Scan here, then use <strong>Message yourself</strong> to send <code>/ticla help</code>.</li>
      </ol>
      {!pairing && <button type="button" onClick={() => void start()} disabled={busy || !channel.configured || !consent || !ack} className="btn-dw w-full !min-h-11 disabled:opacity-50">
        {busy ? "Preparing…" : "Show WhatsApp QR"}
      </button>}
      {!channel.configured && <p className="text-xs text-[var(--text-muted)]">The local QR service is not ready. Start the whatsapp-bridge container; no Meta credentials are needed.</p>}
    </>}
    {(channel.has_session || watching || connected || pairing) && <button type="button" onClick={() => void disconnect()} disabled={busy} className="w-full rounded-lg border border-[var(--border-dim)] px-4 py-3 text-sm font-semibold disabled:opacity-50">{busy ? "Please wait…" : connected ? "Disconnect WhatsApp" : "Cancel / disconnect session"}</button>}
    {session.error && <p role="alert" className="text-sm leading-6 text-[var(--danger)]">{session.error}</p>}
    {message && <p role="status" className="text-sm leading-6">{message}</p>}
    <p className="text-xs leading-5 text-[var(--text-muted)]">Keep this server running for commands and alerts. Unlink the device from your phone at any time. Commands from other chats and groups are ignored.</p>
  </article>;
}
