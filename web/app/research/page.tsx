"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";

type Requirements = { research_mode: boolean; template: unknown; entity_labels: string[]; categories: string[]; relevance: string[]; required_evidence: Record<string, string>; label_studio_config: string };
type Agreement = { paired_documents: number; expected_documents: number; threat_category: { kappa: number | null }; scope_relevance: { kappa: number | null }; span_exact: { f1: number } | null; span_partial: { f1: number } | null };
type Audit = { status: string; gold_sha256: string; notice: string; checks: { id: string; status: string; detail: string }[]; practice_agreement: Agreement; benchmark_agreement: Agreement; metrics: unknown };

function download(name: string, value: unknown, text = false) {
  const url = URL.createObjectURL(new Blob([text ? String(value) : JSON.stringify(value, null, 2)], { type: text ? "text/plain" : "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function jsonRequest(path: string, body?: unknown) {
  const response = await fetch(path, { cache: "no-store", ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "The submitted study does not match the proposal schema. Check labels, hashes, identities and offsets.");
  return data;
}
const title = (value: string) => value.replace(/_/g, " ");
const number = (value: number | null | undefined) => value == null ? "Not measured" : value.toFixed(3);

function MFAEnrollment() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { jsonRequest("/api/auth/mfa").then(data => setEnabled(data.enabled)).catch(e => setError(e.message)); }, []);
  async function act(action: "setup" | "confirm") {
    setBusy(true); setError("");
    try {
      const result = await jsonRequest(`/api/auth/mfa/${action}`, action === "setup" ? { password } : { code });
      setPassword("");
      if (action === "setup") setSecret(result.secret);
      else { setSecret(""); setCode(""); setEnabled(true); setRecovery(result.recovery_codes); }
    } catch (e) { setError(e instanceof Error ? e.message : "MFA enrollment failed"); }
    finally { setBusy(false); }
  }
  return <section className="dw-card min-w-0 p-6">
    <h2 className="text-lg font-bold">Protect your account</h2>
    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Enroll an authenticator on each researcher and supervisor account. Enabling your account does not verify anyone else’s MFA.</p>
    {enabled === true && <p className="mt-4 text-sm font-bold text-[var(--success-text)]">MFA enabled on your account</p>}
    {enabled === false && !secret && <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); void act("setup"); }}><label className="block text-sm">Current password<input className="dw-input mt-2" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button disabled={busy} className="btn-dw">Set up authenticator</button></form>}
    {secret && <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); void act("confirm"); }}><p className="text-sm leading-6">Add a time-based account named “TiclaSec” in your authenticator using this setup key. Keep it private. Setup expires after 10 minutes.</p><code className="block break-all rounded-xl bg-[var(--bg-raised)] p-4 text-sm select-all">{secret}</code><label className="block text-sm">Current 6-digit code<input className="dw-input mt-2" value={code} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} onChange={e => setCode(e.target.value)} required /></label><button disabled={busy} className="btn-dw">Confirm MFA</button></form>}
    {recovery.length > 0 && <div className="mt-4 space-y-3"><p className="text-sm leading-6">Save these one-use recovery codes offline now. They will not be shown again. Your old password-only sessions are no longer accepted.</p><pre className="overflow-x-auto rounded-xl bg-[var(--bg-raised)] p-4 text-xs">{recovery.join("\n")}</pre><button className="btn-dw btn-dw-ghost" onClick={() => download("ticlasec-recovery-codes.txt", recovery.join("\n"), true)}>Save recovery codes</button><Link className="block text-sm font-bold text-[var(--accent-text)]" href="/login">Sign in with the next authenticator code →</Link></div>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
  </section>;
}

export default function ResearchPage() {
  const [requirements, setRequirements] = useState<Requirements | null>(null);
  const [source, setSource] = useState("");
  const [report, setReport] = useState<Audit | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { jsonRequest("/api/evaluation/proposal").then(setRequirements).catch(e => setError(e.message)); }, []);
  const audit = async () => {
    setBusy(true); setError(""); setReport(null);
    try { setReport(await jsonRequest("/api/evaluation/proposal/audit", JSON.parse(source))); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to validate study"); }
    finally { setBusy(false); }
  };
  return <div className="min-h-screen bg-[var(--bg-void)] pb-24 lg:pb-0 lg:pl-[288px]">
    <AppNav />
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12 [&_button]:max-w-full [&_button]:!whitespace-normal">
      <header className="mb-8 max-w-3xl"><p className="text-xs font-bold uppercase tracking-widest text-[var(--accent-text)]">Final-year research · Zambia pilot</p><h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Research readiness</h1><p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">A clear path from a working product to a defensible submission. Check the study against your proposal, preserve independent annotations, and document what still needs approval or measurement.</p></header>
      <div className="mb-8 rounded-2xl border border-[var(--warning)]/30 bg-[var(--warning-dim)] p-5 text-sm leading-6" role="status"><strong>{requirements ? (requirements.research_mode ? "Research safety mode is on." : "Live product mode is active — not a verified research environment.") : "Loading research configuration…"}</strong> {requirements?.research_mode ? "Live jobs and legacy AI actions are paused; existing cases remain readable. Use the offline, sanitized study workflow below." : "A working collector is not permission to collect. Confirm ethics approval and source-specific controls first."} This page cannot grant university approval or fabricate evaluation results.</div>
      <section aria-label="Study sequence" className="mb-8 grid gap-4 md:grid-cols-3">
        {[ ["01", "Prepare the corpus", "5 separate practice documents, then 50 benchmark documents: 20 synthetic + 30 archived, or the approved live-data variant."], ["02", "Annotate independently", "Separate B/C Label Studio projects, ≥60 minutes training, practice kappa ≥0.70, then supervisor adjudication and frozen gold."], ["03", "Measure and report", "Run the pinned model on the same text. Compare exact/partial F1, classification, blinded ratings and real manual/pipeline times."] ].map(([n, heading, description]) => <article key={n} className="dw-card p-5"><p className="font-mono text-xs font-bold text-[var(--accent-text)]">{n}</p><h2 className="mt-3 font-bold">{heading}</h2><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{description}</p></article>)}
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="dw-card min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Validate your study</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">Import sanitized study JSON exported by the local study tool. The audit is not stored by this page and makes no AI or Tor requests.</p></div></div>
          <div className="my-5 flex flex-wrap gap-2"><button className="btn-dw btn-dw-ghost btn-dw-sm" disabled={!requirements} onClick={() => { setSource(JSON.stringify(requirements?.template, null, 2)); setReport(null); }}>Start empty study</button><label className="btn-dw btn-dw-ghost btn-dw-sm cursor-pointer">Import sanitized JSON<input className="hidden" type="file" accept="application/json,.json" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 4_000_000) { setError("Study exceeds the 4 MB limit"); return; } try { const text = await f.text(); JSON.parse(text); setSource(text); setReport(null); setError(""); } catch { setError("Choose a valid JSON study export, not an encrypted artifact or raw source file"); } }} /></label><button className="btn-dw btn-dw-ghost btn-dw-sm" disabled={!requirements} onClick={() => download("label-studio-config.xml", requirements?.label_studio_config, true)}>Label Studio configuration</button></div>
          <label className="block text-sm font-bold" htmlFor="study-json">Study records</label><textarea id="study-json" className="dw-input mt-2 h-80 resize-y font-mono text-xs leading-5" spellCheck={false} value={source} onChange={e => { setSource(e.target.value); setReport(null); }} placeholder="No study has been imported. Do not paste unredacted source material." />
          {error && <p role="alert" className="mt-3 rounded-xl bg-[var(--danger-dim)] p-3 text-sm text-[var(--danger)]">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-3"><button disabled={!source.trim() || busy} className="btn-dw" onClick={() => void audit()}>{busy ? "Checking…" : "Check proposal requirements"}</button><Link href="/evaluation" className="btn-dw btn-dw-ghost">Exploratory metrics</Link></div>
          <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">Study preparation, encrypted artifacts, annotation imports and measured model runs use <code>python -m research_evaluation.study_cli --help</code>. Full operating instructions: <code>docs/SUBMISSION_READINESS.md</code>.</p>
        </section>
        <MFAEnrollment />
      </div>
      {report && <section className="dw-card mt-8 p-5 sm:p-7" aria-live="polite"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-xl font-bold">{report.status === "not_submission_ready" ? "Requirements still outstanding" : "Evidence complete — supervisor review required"}</h2><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{report.checks.filter(c => c.status === "met").length} of {report.checks.length} checks met. “Met” describes supplied records, not independent verification.</p></div><button className="btn-dw btn-dw-ghost h-fit" onClick={() => download("proposal-readiness.json", report)}>Download audit</button></div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">{[["Practice agreement", report.practice_agreement], ["Benchmark agreement", report.benchmark_agreement]].map(([label, raw]) => { const a = raw as Agreement; return <div key={label as string} className="rounded-xl border border-[var(--border-dim)] p-4"><h3 className="font-bold">{label as string}</h3><p className="mt-1 text-xs text-[var(--text-muted)]">{a.paired_documents} / {a.expected_documents} paired B/C documents</p><dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><dt>Category κ</dt><dd>{number(a.threat_category.kappa)}</dd><dt>Zambia relevance κ</dt><dd>{number(a.scope_relevance.kappa)}</dd><dt>Exact span F1</dt><dd>{number(a.span_exact?.f1)}</dd><dt>Partial span F1</dt><dd>{number(a.span_partial?.f1)}</dd></dl></div>; })}</div>
        <ul className="mt-6 divide-y divide-[var(--border-dim)]">{report.checks.map(check => <li key={check.id} className="flex items-start gap-4 py-4"><span className={`mt-1 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${check.status === "met" ? "bg-[var(--success-dim)] text-[var(--success-text)]" : "bg-[var(--warning-dim)] text-[var(--warning)]"}`}>{check.status}</span><div className="min-w-0"><h3 className="text-sm font-bold capitalize">{title(check.id)}</h3><p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{check.detail}</p></div></li>)}</ul><p className="mt-4 text-xs leading-6 text-[var(--text-muted)]">{report.notice}</p><p className="mt-3 break-all font-mono text-[10px] text-[var(--text-muted)]">Gold content hash: {report.gold_sha256}</p>
      </section>}
      <section className="dw-card mt-8 p-6"><h2 className="text-xl font-bold">Evidence you must supply</h2><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">The proposal includes human and operational commitments that cannot be completed by adding code. No uploaded references are treated as authenticated signatures.</p><div className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">{requirements && Object.entries(requirements.required_evidence).map(([key, description]) => <div key={key}><h3 className="text-sm font-bold capitalize">{title(key)}</h3><p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{description}</p></div>)}</div></section>
    </main>
  </div>;
}
