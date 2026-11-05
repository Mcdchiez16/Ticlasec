"use client";
import { useEffect, useState } from "react";
import { ModelSelector } from "@/components/ModelSelector";
import { WhatsAppQRPanel } from "@/components/WhatsAppQRPanel";
import type { Channel } from "@/hooks/useChannels";

type Props = { channels: Channel[]; loading: boolean; error: string; refresh: () => Promise<void> };
type Pending = { provider: string; url: string; command: string; expires_at: number };

export function ChannelsPanel({ channels, loading, error, refresh }: Props) {
  const [consent, setConsent] = useState(false);
  const [model, setModel] = useState("gpt-4o-mini");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    if (pending && channels.some((c) => c.provider === pending.provider && c.connected)) setPending(null);
  }, [channels, pending]);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(null), Math.max(0, pending.expires_at * 1000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [pending]);

  async function act(channel: Channel) {
    setBusy(channel.provider); setMessage("");
    try {
      const response = await fetch(channel.connected ? `/api/channels/${channel.provider}` : "/api/channels/link", {
        method: channel.connected ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: channel.connected ? undefined : JSON.stringify({ provider: channel.provider, consent, model }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not update the channel.");
      if (channel.connected) { setPending(null); setMessage("Channel disconnected. Chat access and connected-account alerts are revoked."); }
      else setPending({ ...data, provider: channel.provider });
      await refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not update the channel."); }
    finally { setBusy(""); }
  }

  return <section id="channels" className="scroll-mt-8 space-y-6 dw-card p-5 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-xl font-extrabold">Channels</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-muted)]">Connect your account to Telegram or WhatsApp. Start investigations, check progress, read briefings, and receive monitoring alerts from a private chat.</p></div>
      <button type="button" onClick={() => void refresh()} className="text-sm text-[var(--accent-text)]">Refresh connections</button>
    </div>
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <div className="min-w-0 space-y-2"><p className="text-sm font-semibold">Model for new chat connections</p><ModelSelector value={model} onChange={setModel} />
        <p className="text-xs leading-5 text-[var(--text-muted)]">Chat investigations use Fast depth and Global scope. Your account’s model credentials apply.</p></div>
      <label className="flex items-start gap-3 rounded-xl bg-[var(--bg-void)] p-4 text-sm leading-6">
        <input className="mt-1.5 shrink-0" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>I allow this messaging provider to process my commands, case briefings, and alerts. Anyone with access to my linked chat can use these functions.</span>
      </label>
    </div>
    {loading && <p role="status" className="text-sm">Loading channels…</p>}
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {channels.map((channel) => channel.provider === "whatsapp" && channel.connection_mode === "qr"
        ? <WhatsAppQRPanel key={channel.provider} channel={channel} consent={consent} model={model} refresh={refresh} />
        : <article key={channel.provider} className="min-w-0 rounded-xl border border-[var(--border-dim)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold capitalize text-lg">{channel.provider}</h3>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${channel.connected ? "bg-[var(--success-dim)] text-[var(--success-text)]" : "bg-[var(--bg-void)] text-[var(--text-muted)]"}`}>
            {channel.connected ? "Connected" : channel.configured ? "Ready to link" : "Setup required"}
          </span>
        </div>
        <p className="text-sm leading-6 text-[var(--text-muted)]">
          {channel.connected ? `Account ${channel.identity} · model ${channel.model}` : channel.provider === "telegram"
            ? "Link a private conversation with your organisation’s Telegram bot. Group chats are not supported."
            : "Link your phone to the organisation’s WhatsApp Business number. A normal personal WhatsApp account cannot host this integration."}
        </p>
        <button type="button" onClick={() => void act(channel)} disabled={!!busy || (!channel.connected && (!channel.configured || !consent))}
          className="btn-dw w-full !min-h-11 disabled:opacity-50">
          {busy === channel.provider ? "Please wait…" : channel.connected ? "Disconnect" : channel.configured ? `Connect ${channel.provider === "telegram" ? "Telegram" : "WhatsApp"}` : "Provider setup required"}
        </button>
        {!channel.configured && <details className="text-xs leading-6 text-[var(--text-muted)]">
          <summary className="cursor-pointer font-semibold text-[var(--accent-text)]">Operator setup checklist</summary>
          <p className="mt-2">Set these server environment variables (never put tokens in chat or browser code):</p>
          <ul className="list-disc pl-4 break-words">{channel.missing.map((key) => <li key={key}><code>{key}</code></li>)}</ul>
          <p className="mt-2">Register your public HTTPS webhook:</p>
          <code className="block break-all">/api/channels/webhooks/{channel.provider}</code>
          <p className="mt-2">Complete instructions: docs/CHANNELS.md in the project.</p>
        </details>}
        {pending?.provider === channel.provider && <div className="rounded-lg bg-[var(--accent-dim)] p-4 space-y-3 text-sm">
          <p>Open your own chat and send the link command. This one-time link expires in 10 minutes. Do not share it.</p>
          <a className="inline-block font-bold text-[var(--accent-text)] underline" href={pending.url} target="_blank" rel="noreferrer noopener">Open {channel.provider === "telegram" ? "Telegram" : "WhatsApp"} to connect</a>
          <p className="text-xs">Or send this command to the configured bot/business number:</p>
          <code className="block break-all rounded bg-[var(--bg-void)] p-2 text-xs select-all">{pending.command}</code>
          <p className="text-xs">Waiting for confirmation from your chat…</p>
        </div>}
        {channel.provider === "whatsapp" && <p className="text-xs leading-5 text-[var(--text-muted)]">Replies and alerts work within 24 hours of your last message. Outside that window, check alerts here or message the business again. Approved outbound templates are not yet supported.</p>}
      </article>)}
    </div>
    <div className="border-t border-[var(--border-dim)] pt-5">
      <h3 className="text-sm font-bold mb-3">What you can send</h3>
      <p className="mb-4 text-xs leading-5 text-[var(--text-muted)]">For WhatsApp QR, add <code>/ticla</code> before each command in Message yourself, for example <code>/ticla cases</code>. For Telegram or WhatsApp Cloud API, send the commands below to the configured bot or business chat.</p>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        {[["investigate ransomware activity", "Start a new investigation"], ["cases", "List your latest case IDs"], ["status <case ID>", "Check collection progress"], ["brief <case ID>", "Read the evidence briefing"], ["monitors", "List your active watchlists"], ["help", "Show available commands"]].map(([command, description]) =>
          <div key={command} className="min-w-0"><dt className="font-semibold break-words">{command}</dt><dd className="mt-1 text-xs text-[var(--text-muted)]">{description}</dd></div>)}
      </dl>
    </div>
  </section>;
}
