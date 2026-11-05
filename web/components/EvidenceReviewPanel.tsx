"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalystDecision, CaseReview, OrganizationProfile, ReviewFinding } from "@/lib/types/evidence-review";

function date(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Unknown";
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportReport(data: CaseReview) {
  const lines = ["TiclaSec — Analyst case report", `Investigation: ${data.investigation_id}`,
    `Query: ${data.query}`, `Generated: ${data.generated_at}`, `Model: ${data.model || "Unknown"}`,
    `Dataset: ${data.synthetic ? "Synthetic demonstration" : "Collected investigation evidence"}`,
    `Organization profile: ${data.organization.name || "Not set"}`, "", data.limitations, ""];
  for (const finding of data.findings) {
    const review = finding.review;
    lines.push(`${finding.value} (${finding.entity_type})`,
      `Review: ${review?.stale ? "Evidence changed — review required" : review?.decision || "Unreviewed"}`,
      `Automatic assessment: ${finding.quality.reason}`,
      `Heuristic rank: ${Math.round(finding.quality.score * 100)}/100 (not a probability)`,
      `Analyst independent confirmation: ${review?.independent_confirmation && !review.stale ? "Recorded by analyst" : "Not recorded"}`,
      `Decision reason: ${review?.reason || "Not recorded"}`,
      `Assigned to: ${review?.assigned_to || "Unassigned"}`, `Next action: ${review?.next_action || "Not recorded"}`);
    for (const source of finding.provenance.sources) lines.push(
      `Source ${source.page_id}: ${source.url}`, `Published: ${date(source.published_at)}; Collected: ${date(source.collected_at)}`,
      `Text SHA-256: ${source.content_sha256}`, `Repeated passage: ${source.duplicate_of || "No matching copy detected"}`, source.excerpt, "");
  }
  lines.push("Review history", JSON.stringify(data.history, null, 2));
  download(`ticlasec-report-${data.investigation_id}.txt`, lines.join("\n"), "text/plain;charset=utf-8");
}

function ReviewEditor({ finding, caseData, onSaved }: { finding: ReviewFinding; caseData: CaseReview; onSaved: () => Promise<void> }) {
  const [decision, setDecision] = useState<AnalystDecision["decision"]>(finding.review?.decision || "needs_review");
  const [reason, setReason] = useState(finding.review?.reason || "");
  const [nextAction, setNextAction] = useState(finding.review?.next_action || "");
  const [assignedTo, setAssignedTo] = useState(finding.review?.assigned_to || "");
  const [selected, setSelected] = useState<string[]>(finding.review?.source_ids || []);
  const [independent, setIndependent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const available = finding.provenance.sources.filter(source => selected.includes(source.page_id));
  const canConfirm = decision === "accepted" && available.length >= 2 && available.every(s => !s.duplicate_of && s.supports_role && s.origin)
    && new Set(available.map(s => s.origin)).size >= 2;
  const frozen = ["pending", "processing", "running"].includes(caseData.status);

  async function save() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/investigations/${caseData.investigation_id}/workbench/${finding.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason, next_action: nextAction, assigned_to: assignedTo,
          source_ids: selected, independent_confirmation: independent && canConfirm,
          evidence_fingerprint: finding.provenance.fingerprint, expected_version: caseData.version }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : "Check the review fields and try again");
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save review"); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-xs text-[var(--text-muted)]">{finding.entity_type.replaceAll("_", " ")}</p>
        <h2 className="mt-1 break-words text-xl font-bold">{finding.value}</h2></div>
      <span className="rounded-full bg-[var(--bg-raised)] px-3 py-1 text-xs">{finding.review?.stale ? "Evidence changed" : finding.review?.decision.replaceAll("_", " ") || "Unreviewed"}</span>
    </div>
    <p className="text-sm leading-6 text-[var(--text-secondary)]">{finding.quality.reason}</p>
    <div className="grid grid-cols-3 gap-2 text-center">
      {[[finding.provenance.mention_count, "Pages mentioning it"], [finding.provenance.unique_passages, "Supporting passages"], [finding.provenance.duplicate_count, "Repeated copies"]].map(([value, label]) =>
        <div key={label} className="rounded-xl bg-[var(--bg-raised)] p-3"><p className="text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">{label}</p></div>)}
    </div>
    <p className="text-xs leading-5 text-[var(--text-muted)]">{finding.provenance.independence} Rank {Math.round(finding.quality.score * 100)}/100 is a rule-based score.</p>
    {finding.organization_match.matches.length > 0 && <div className="rounded-xl bg-[var(--accent-dim)] p-3 text-sm">
      <p className="font-semibold">Organization relevance: {finding.organization_match.level.replaceAll("_", " ")}</p>
      <p className="mt-1 text-xs">Matched: {[...new Set(finding.organization_match.matches.flatMap(m => [...m.direct, ...m.contextual]))].join(", ")}. {finding.organization_match.explanation}</p>
    </div>}
    <section aria-label="Supporting passages" className="space-y-3">
      <h3 className="font-semibold">Select the passages supporting your decision</h3>
      {!finding.provenance.sources.length && <p className="text-sm text-[var(--text-muted)]">No matching passage is retained in this case. Leave the finding unverified or reject it with a reason.</p>}
      {finding.provenance.sources.map((source, index) => <article key={source.page_id} className="rounded-xl border border-[var(--border-dim)] p-4">
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={selected.includes(source.page_id)} onChange={e => setSelected(current => e.target.checked ? [...current, source.page_id] : current.filter(id => id !== source.page_id))} />
          <span className="min-w-0"><span className="text-sm font-semibold">Source {index + 1}</span><span className="mt-1 block break-all text-xs text-[var(--accent-text)]">{source.url}</span></span></label>
        <blockquote className="my-3 border-l-2 border-[var(--accent-border)] pl-3 text-sm leading-6 text-[var(--text-secondary)]">{source.excerpt}</blockquote>
        <dl className="grid gap-2 text-xs sm:grid-cols-2"><div><dt className="text-[var(--text-muted)]">Source publication date</dt><dd>{date(source.published_at)}</dd></div><div><dt className="text-[var(--text-muted)]">Collected</dt><dd>{date(source.collected_at)}</dd></div></dl>
        {source.duplicate_of && <p className="mt-2 text-xs text-[var(--warning)]">Repeated or near-identical passage; does not add independent support.</p>}
        <details className="mt-3 text-xs text-[var(--text-muted)]"><summary className="cursor-pointer">Source checks and content fingerprint</summary><p className="mt-2">{source.reason}</p><p className="mt-1 break-all">SHA-256 of stored text: {source.content_sha256}</p><p className="mt-1">Page: {source.page_id}</p></details>
      </article>)}
    </section>
    <section className="space-y-3 border-t border-[var(--border-dim)] pt-5">
      <h3 className="font-semibold">Analyst decision</h3>
      {finding.review?.independent_confirmation && !finding.review.stale && <p className="text-sm text-[var(--success-text)]">An analyst recorded independent confirmation. This is an analyst assessment, not automatic verification.</p>}
      {finding.review?.stale && <p role="status" className="text-sm text-[var(--warning)]">The evidence has changed since the last review. Confirm the current passages before saving.</p>}
      <label className="block text-sm">Decision<select aria-label="Review decision" className="dw-select mt-1" value={decision} onChange={e => setDecision(e.target.value as AnalystDecision["decision"])}><option value="needs_review">Needs further review</option><option value="accepted">Accept as an investigation lead</option><option value="rejected">Reject as unsupported / irrelevant</option></select></label>
      <label className="block text-sm">Reason<textarea aria-label="Review reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} className="dw-input mt-1 min-h-24 text-sm" placeholder="Explain which evidence supports or contradicts this lead." /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Assigned team or analyst<input aria-label="Assigned team or analyst" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} maxLength={120} className="dw-input mt-1 text-sm" placeholder="e.g. SOC" /></label>
        <label className="block text-sm">Next action<input aria-label="Next analyst action" value={nextAction} onChange={e => setNextAction(e.target.value)} maxLength={1000} className="dw-input mt-1 text-sm" placeholder="What should be checked next?" /></label></div>
      <label className="flex items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]"><input type="checkbox" className="mt-1" disabled={!canConfirm} checked={independent && canConfirm} onChange={e => setIndependent(e.target.checked)} />I checked that the selected reports independently support the same claim. Explain this in the reason above.</label>
      <p className="text-xs text-[var(--text-muted)]">Requires two supporting, non-duplicate passages from different origins. Acceptance alone does not verify the underlying incident.</p>
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      <button className="btn-dw" disabled={busy || frozen || reason.trim().length < 5 || (decision === "accepted" && selected.length === 0)} onClick={() => void save()}>{busy ? "Saving…" : "Save review"}</button>
      {frozen && <p className="text-xs text-[var(--text-muted)]">Reviews become available after collection finishes.</p>}
    </section>
  </div>;
}

export function EvidenceReviewPanel({ investigationId, initialEntityId = "" }: { investigationId: string; initialEntityId?: string }) {
  const [data, setData] = useState<CaseReview | null>(null);
  const [selected, setSelected] = useState(initialEntityId);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<OrganizationProfile>({});
  const load = useCallback(async () => {
    const response = await fetch(`/api/investigations/${encodeURIComponent(investigationId)}/workbench`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : "Could not load evidence review");
    setData(payload); setProfile(payload.organization); setError("");
  }, [investigationId]);
  useEffect(() => { void load().catch(e => setError(e.message)); }, [load]);
  const findings = useMemo(() => (data?.findings || []).filter(f => f.value.toLowerCase().includes(search.toLowerCase()) && (
    filter === "all" || filter === "withheld" && !f.quality.usable || filter === "unreviewed" && (!f.review || f.review.stale)
    || filter === "relevant" && f.organization_match.level !== "no_explicit_match" || f.review?.decision === filter
  )), [data, filter, search]);
  const finding = findings.find(f => f.id === selected) || findings[0];

  async function saveProfile() {
    if (!data) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/investigations/${encodeURIComponent(investigationId)}/workbench/organization`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...profile, expected_version: data.version }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : "Check the organization fields");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save profile"); }
    finally { setSaving(false); }
  }

  return <div className="h-full overflow-y-auto bg-[var(--bg-void)] p-4 text-[var(--text-primary)] sm:p-6">
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold">Evidence review & case report</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Trace a finding, record your decision, and preserve the evidence behind it.</p></div>
        {data && <div className="flex flex-wrap gap-2"><button onClick={() => exportReport(data)} className="btn-dw btn-dw-ghost btn-dw-sm">Export report</button><a href={`/api/investigations/${encodeURIComponent(investigationId)}/workbench/export`} className="btn-dw btn-dw-ghost btn-dw-sm">Evidence JSON</a><button onClick={() => void load().catch(e => setError(e.message))} className="btn-dw btn-dw-ghost btn-dw-sm">Reload</button></div>}</div>
      {error && <p role="alert" className="rounded-xl bg-[var(--danger-dim)] p-3 text-sm text-[var(--danger)]">{error}</p>}
      {!data && !error && <p role="status">Loading case evidence…</p>}
      {data && <>
        <details className="dw-card p-4"><summary className="cursor-pointer font-semibold">Organization focus {data.organization.name ? `· ${data.organization.name}` : "· optional"}</summary>
          <p className="my-3 text-xs leading-5 text-[var(--text-muted)]">Matches names and domains in the retained passages. Country and sector provide context. Saving this profile does not start another scrape.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {([ ["name", "Organization", 120], ["domains", "Domains (comma separated)", 1000], ["sector", "Sector", 80], ["country", "Country or region", 80] ] as const).map(([key, label, max]) => <label key={key} className="text-xs font-semibold">{label}<input aria-label={label} className="dw-input mt-1 text-sm" maxLength={max} value={key === "domains" ? (profile.domains || []).join(", ") : profile[key] || ""} onChange={e => setProfile(current => ({ ...current, [key]: key === "domains" ? e.target.value.split(",").map(s => s.trim()) : e.target.value }))} /></label>)}
          </div><button className="btn-dw btn-dw-sm mt-4" disabled={saving || ["pending", "processing", "running"].includes(data.status)} onClick={() => void saveProfile()}>{saving ? "Saving…" : "Save organization focus"}</button>
        </details>
        <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="dw-card space-y-3 p-4 lg:sticky lg:top-0">
            <input aria-label="Search findings" className="dw-input text-sm" placeholder="Search findings…" value={search} onChange={e => setSearch(e.target.value)} />
            <select aria-label="Filter findings" className="dw-select" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All findings</option><option value="unreviewed">Unreviewed / changed</option><option value="withheld">Withheld by quality checks</option><option value="relevant">Organization matches</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select>
            <p className="text-xs text-[var(--text-muted)]">{findings.length} findings · including withheld extractions</p>
            <div className="max-h-64 space-y-2 overflow-y-auto lg:max-h-[55vh]">{findings.map(f => <button key={f.id} onClick={() => setSelected(f.id)} className={`w-full rounded-xl border p-3 text-left ${f.id === finding?.id ? "border-[var(--accent-border)] bg-[var(--accent-dim)]" : "border-[var(--border-dim)]"}`}><span className="block break-words text-sm font-semibold">{f.value}</span><span className="mt-1 block text-xs text-[var(--text-muted)]">{f.review?.stale ? "Review outdated" : f.review?.decision.replaceAll("_", " ") || (f.quality.usable ? "Unreviewed lead" : "Withheld extraction")}</span></button>)}</div>
          </aside>
          <section className="dw-card min-w-0 p-4 sm:p-6">{finding ? <>
            <ReviewEditor key={`${finding.id}:${data.version}`} finding={finding} caseData={data} onSaved={load} />
            <details className="mt-6 border-t border-[var(--border-dim)] pt-4"><summary className="cursor-pointer text-sm font-semibold">Connections in this case</summary>
              <p className="my-2 text-xs text-[var(--text-muted)]">Shared presence does not prove identity or control. Inspect the associated page before accepting a relationship.</p>
              {data.relationships.filter(edge => edge.source === finding.id || edge.target === finding.id).map(edge => <div key={edge.id} className="my-2 rounded-lg bg-[var(--bg-raised)] p-3 text-xs">
                <p>{data.findings.find(f => f.id === edge.source)?.value} → {edge.type.replaceAll("_", " ")} → {data.findings.find(f => f.id === edge.target)?.value}</p><p className="mt-1 text-[var(--text-muted)]">{edge.interpretation}</p><p className="mt-1">{edge.page_id ? `Source page: ${edge.page_id}` : "Source passage unavailable"}</p>
                {finding.provenance.sources.filter(s => s.page_id === edge.page_id).map(s => <blockquote key={s.page_id} className="mt-2 border-l-2 border-[var(--accent-border)] pl-2 leading-5"><p className="break-all">{s.url}</p><p>{s.excerpt}</p><p className="text-[var(--text-muted)]">The passage shows this finding; verify that it also supports the stated relationship.</p></blockquote>)}
              </div>)}
            </details>
          </> : <p className="text-sm text-[var(--text-muted)]">No findings match this filter.</p>}</section>
        </div>
        <details className="dw-card p-4"><summary className="cursor-pointer font-semibold">Review history · {data.history.length} changes</summary><div className="mt-3 max-h-80 space-y-3 overflow-y-auto">{[...data.history].reverse().map((entry, index) => <div key={index} className="border-t border-[var(--border-dim)] pt-3 text-sm"><p>{entry.kind.replaceAll("_", " ")} · {date(entry.at)} · Reviewer {entry.reviewer_id}</p>{entry.entity_id && <p className="mt-1">{data.findings.find(f => f.id === entry.entity_id)?.value || entry.entity_id}: {entry.decision}</p>}{entry.reason && <p className="mt-1 text-[var(--text-secondary)]">{entry.reason}</p>}</div>)}</div></details>
      </>}
    </div>
  </div>;
}
