"use client";

import { Fragment, type ReactNode, useMemo, useState } from "react";
import type { InvestigationEntity } from "@/lib/types/investigation";

interface Props {
  summary?: string | null;
  query: string;
  entityCount: number;
  relationshipCount: number;
  pagesCrawled: number;
  entities?: InvestigationEntity[];
  investigationId?: string;
  onSummaryUpdated?: (summary: string) => void;
  onReviewEvidence?: (entityId: string) => void;
  scopeLabel?: string;
  scopeAssessment?: {
    score: number;
    level: string;
    documents_matched: number;
    documents_assessed: number;
    rationale: string;
  } | null;
}

const INTELLIGENCE_GROUPS = [
  {
    key: "actors",
    title: "Threat actors & groups",
    description: "Named actors, ransomware groups, aliases and handles found in the evidence.",
    types: new Set(["THREAT_ACTOR", "THREAT_ACTOR_HANDLE", "RANSOMWARE_GROUP"]),
  },
  {
    key: "threats",
    title: "Threats & techniques",
    description: "Malware, vulnerabilities and ATT&CK techniques that defenders can investigate.",
    types: new Set(["MALWARE", "MALWARE_FAMILY", "CVE", "CVE_NUMBER", "MITRE_TECHNIQUE"]),
  },
  {
    key: "infrastructure",
    title: "Infrastructure & indicators",
    description: "Network and dark-web indicators suitable for validation and defensive hunting.",
    types: new Set(["IP_ADDRESS", "DOMAIN", "C2_SERVER", "ONION_URL", "PASTE_URL"]),
  },
] as const;

function formatEntityType(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
}

const LEAD_STATUS_META: Record<string, { label: string; className: string }> = {
  corroborated: {
    label: "Legacy assessment · review needed",
    className: "border-[var(--warning)]/30 bg-[var(--warning-dim)] text-[var(--warning)]",
  },
  format_validated: {
    label: "Valid indicator format",
    className: "border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent-text)]",
  },
  single_source: {
    label: "Single-source lead",
    className: "border-[var(--warning)]/30 bg-[var(--warning-dim)] text-[var(--warning)]",
  },
};

function sourceHost(url?: string | null): string {
  if (!url) return "Source URL unavailable";
  try {
    return new URL(url.replace(/\[\.\]/g, ".")).hostname;
  } catch {
    return url.length > 54 ? `${url.slice(0, 53)}…` : url;
  }
}

function safeSourceHref(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function analystNextStep(entity: InvestigationEntity): string {
  const type = entity.entity_type.toUpperCase();
  if (["THREAT_ACTOR", "THREAT_ACTOR_HANDLE", "RANSOMWARE_GROUP"].includes(type)) {
    return "Pivot on this name across leak posts, aliases and victim mentions. Require an independent source before attribution or escalation.";
  }
  if (["MALWARE", "MALWARE_FAMILY"].includes(type)) {
    return "Search EDR, malware-analysis and threat-intelligence records for this family, then collect associated hashes, domains and process behaviour.";
  }
  if (["CVE", "CVE_NUMBER"].includes(type)) {
    return "Check the asset inventory for affected products, confirm exposure, and verify patch or compensating-control status.";
  }
  if (["IP_ADDRESS", "DOMAIN", "C2_SERVER"].includes(type)) {
    return "Validate reputation and ownership, then search DNS, proxy and firewall telemetry before considering a block.";
  }
  if (type === "ONION_URL") {
    return "Review only in an isolated Tor environment, preserve the collection time, and record the specific claim made on the page.";
  }
  return "Validate this value in its original source and look for an independent source that confirms the same role or activity.";
}

function EvidenceLead({ entity, onReviewEvidence }: { entity: InvestigationEntity; onReviewEvidence?: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const confidence = Math.round(Math.max(0, Math.min(1, Number(entity.confidence) || 0)) * 100);
  const leadScore = Math.round(Math.max(0, Math.min(1, Number(entity.lead_score) || 0)) * 100);
  const sources = Math.max(1, Number(entity.source_count) || 1);
  const context = (entity.lead_excerpt || entity.context_snippet || entity.context || "").replace(/\s+/g, " ").trim();
  const status = LEAD_STATUS_META[entity.lead_status || "single_source"] ?? LEAD_STATUS_META.single_source;
  const sourceUrl = entity.source_url || "";
  const sourceHref = safeSourceHref(sourceUrl);
  const onionSource = sourceUrl.toLowerCase().includes(".onion");

  async function copySource() {
    if (!sourceUrl) return;
    await navigator.clipboard.writeText(sourceUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <article className="rounded-xl border border-[var(--border-dim)] bg-[var(--bg-void)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-[14px] font-bold leading-5 text-[var(--text-primary)]">{entity.value}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
            {formatEntityType(entity.entity_type)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-bold uppercase tracking-wider ${status.className}`}>
          {status.label}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <div className="rounded-lg bg-[var(--bg-raised)] px-2 py-2">
          <p className="text-[11px] font-bold text-[var(--text-primary)]">{leadScore}/100</p>
          <p className="text-[8px] uppercase tracking-wider text-[var(--text-muted)]">Rule-based rank</p>
        </div>
        <div className="rounded-lg bg-[var(--bg-raised)] px-2 py-2">
          <p className="text-[11px] font-bold text-[var(--text-primary)]">{confidence}%</p>
          <p className="text-[8px] uppercase tracking-wider text-[var(--text-muted)]">Extraction</p>
        </div>
        <div className="rounded-lg bg-[var(--bg-raised)] px-2 py-2">
          <p className="text-[11px] font-bold text-[var(--text-primary)]">{sources}</p>
          <p className="text-[8px] uppercase tracking-wider text-[var(--text-muted)]">{sources === 1 ? "Source" : "Sources"}</p>
        </div>
      </div>

      {entity.lead_reason && (
        <div className="mt-3 rounded-lg border border-[var(--border-dim)] bg-[var(--bg-raised)] px-3 py-2">
          <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Why this lead is shown</p>
          <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">{entity.lead_reason}</p>
        </div>
      )}

      {context && (
        <blockquote className="mt-3 border-l-2 border-[var(--accent-border)] pl-3 text-[10px] leading-5 text-[var(--text-secondary)]">
          <span className="mb-0.5 block text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Evidence excerpt</span>
          “{context}”
        </blockquote>
      )}

      <div className="mt-3 rounded-lg border border-[var(--border-dim)] px-3 py-2.5">
        <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Analyst next step</p>
        <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">{analystNextStep(entity)}</p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border-dim)] pt-3">
        <div className="min-w-0">
          <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Original source</p>
          <p className="mt-0.5 truncate text-[10px] text-[var(--text-secondary)]" title={entity.source_url_display || sourceUrl}>
            {sourceHost(entity.source_url_display || sourceUrl)}
          </p>
        </div>
        {sourceUrl && (onionSource ? (
          <button type="button" onClick={copySource} className="shrink-0 rounded-lg border border-[var(--border-dim)] px-2.5 py-1.5 text-[9px] font-bold text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--accent-text)]">
            {copied ? "Copied" : "Copy for Tor"}
          </button>
        ) : sourceHref ? (
          <a href={sourceHref} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg border border-[var(--border-dim)] px-2.5 py-1.5 text-[9px] font-bold text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--accent-text)]">
            Open source
          </a>
        ) : null)}
      </div>
      {onReviewEvidence && <button className="btn-dw btn-dw-ghost btn-dw-sm mt-3 w-full" onClick={() => onReviewEvidence(entity.id)}>Review evidence & record decision →</button>}
    </article>
  );
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={index} className="font-semibold text-[var(--text-primary)]">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={index} className="rounded bg-[var(--bg-raised)] px-1 py-0.5 text-[11px] font-semibold text-[var(--accent-text)]">{part.slice(1, -1)}</code>;
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

export function BriefingText({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const rendered: ReactNode[] = [];

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      rendered.push(<div key={`space-${index}`} className="h-2" />);
      return;
    }

    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      rendered.push(
        <h3 key={index} className="mb-2 mt-6 text-[15px] font-bold tracking-tight text-[var(--text-primary)] first:mt-0">
          <InlineText text={heading[1]} />
        </h3>
      );
      return;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      rendered.push(
        <div key={index} className="flex gap-3 pl-1 text-[13px] leading-6 text-[var(--text-secondary)]">
          <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
          <p className="min-w-0 break-words"><InlineText text={bullet[1]} /></p>
        </div>
      );
      return;
    }

    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      rendered.push(
        <div key={index} className="flex gap-3 text-[13px] leading-6 text-[var(--text-secondary)]">
          <span className="w-6 shrink-0 font-semibold text-[var(--accent-text)]">{numbered[1]}.</span>
          <p className="min-w-0 break-words"><InlineText text={numbered[2]} /></p>
        </div>
      );
      return;
    }

    rendered.push(
      <p key={index} className="break-words text-[13px] leading-6 text-[var(--text-secondary)]">
        <InlineText text={line} />
      </p>
    );
  });

  return <div>{rendered}</div>;
}

export function AiBriefingPanel({
  summary,
  query,
  entityCount,
  relationshipCount,
  pagesCrawled,
  entities = [],
  investigationId,
  onSummaryUpdated,
  onReviewEvidence,
  scopeLabel = "Global",
  scopeAssessment,
}: Props) {
  const [open, setOpen] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const briefing = summary?.trim();
  const groupedIntel = useMemo(() => INTELLIGENCE_GROUPS.map(group => {
    const seen = new Set<string>();
    const items = entities
      .filter(entity => group.types.has(entity.entity_type as never) && Boolean(entity.value?.trim()) && entity.lead_usable === true)
      .sort((a, b) => (b.lead_score ?? b.priority_score ?? b.confidence ?? 0) - (a.lead_score ?? a.priority_score ?? a.confidence ?? 0))
      .filter(entity => {
        const key = `${entity.entity_type}:${entity.value.trim().toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4);
    return { ...group, items };
  }), [entities]);
  const evidenceLeadCount = groupedIntel.reduce((total, group) => total + group.items.length, 0);
  const withheldLeadCount = useMemo(() => {
    const briefingTypes = new Set(INTELLIGENCE_GROUPS.flatMap(group => [...group.types]));
    return entities.filter(entity => briefingTypes.has(entity.entity_type as never) && entity.lead_usable === false).length;
  }, [entities]);

  async function regenerateBriefing() {
    if (!investigationId || regenerating) return;
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const response = await fetch(
        `/api/investigations/${encodeURIComponent(investigationId)}/briefing`,
        { method: "POST" },
      );
      const payload = await response.json().catch(() => ({})) as {
        summary?: string;
        detail?: string | { message?: string };
        error?: string;
      };
      if (!response.ok || !payload.summary) {
        const detail = typeof payload.detail === "string"
          ? payload.detail
          : payload.detail?.message;
        throw new Error(detail || payload.error || "The briefing could not be regenerated");
      }
      onSummaryUpdated?.(payload.summary);
    } catch (error) {
      setRegenerateError(error instanceof Error ? error.message : "The briefing could not be regenerated");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <section className="min-h-full bg-[var(--bg-void)]">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="sticky top-0 z-20 flex min-h-[64px] w-full items-center justify-between gap-4 border-b border-[var(--border-dim)] bg-[var(--bg-surface)]/95 px-5 py-3 text-left backdrop-blur transition-colors hover:bg-[var(--bg-raised)] lg:px-8"
        aria-expanded={open}
      >
        <span className="mx-auto flex min-w-0 max-w-[1600px] flex-1 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-border)] bg-[var(--accent-dim)] text-[12px] font-bold text-[var(--accent-text)]">AI</span>
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-[var(--text-primary)]">Evidence-led threat briefing</span>
            <span className="block truncate text-[11px] text-[var(--text-muted)]" title={query}>Named threats, actors and defensive leads for “{query}”</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
          {open ? "Hide briefing" : "Read briefing"}
          <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        </span>
      </button>

      {open && (
        <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-5 py-6 lg:px-8 lg:py-8 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            <section className="dw-card px-5 py-5 lg:px-6">
              <div className="mb-5 flex flex-col gap-3 border-b border-[var(--border-dim)] pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-[15px] font-bold text-[var(--text-primary)]">Actionable intelligence leads</h3>
                  <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">
                    Leads shown here passed format and local-context checks. Each card explains the evidence, limitation, source and next analyst action.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {withheldLeadCount > 0 && (
                    <span className="rounded-full border border-[var(--border-dim)] bg-[var(--bg-raised)] px-2.5 py-1 text-[9px] font-bold text-[var(--text-muted)]">
                      {withheldLeadCount} low-context {withheldLeadCount === 1 ? "extraction" : "extractions"} withheld
                    </span>
                  )}
                  <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-dim)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
                    {evidenceLeadCount} usable {evidenceLeadCount === 1 ? "lead" : "leads"}
                  </span>
                </div>
              </div>

              {evidenceLeadCount > 0 ? (
                <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                  {groupedIntel.map(group => (
                    <section key={group.key} className="min-w-0">
                      <div className="mb-3 min-h-[58px]">
                        <h4 className="text-[12px] font-bold text-[var(--text-primary)]">{group.title}</h4>
                        <p className="mt-1 text-[10px] leading-4 text-[var(--text-muted)]">{group.description}</p>
                      </div>
                      {group.items.length > 0 ? (
                        <div className="space-y-2">
                          {group.items.map(entity => <EvidenceLead key={`${entity.entity_type}:${entity.id}`} entity={entity} onReviewEvidence={onReviewEvidence} />)}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-[var(--border-dim)] p-3 text-[10px] leading-4 text-[var(--text-muted)]">
                          No usable {group.title.toLowerCase()} passed the context and format checks. Review withheld extractions only if you need to investigate possible false negatives.
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--border-dim)] p-4 text-[11px] leading-5 text-[var(--text-muted)]">
                  No actor, malware, vulnerability or infrastructure lead passed the evidence-quality checks. The collected pages may be directories, marketplace listings or generic discussions rather than reports of specific activity. This is a data gap—not evidence that no threat exists.
                </div>
              )}
            </section>

            <section className="dw-card px-5 py-5 lg:px-6 lg:py-6">
              <div className="mb-5 flex flex-col gap-3 border-b border-[var(--border-dim)] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-[15px] font-bold text-[var(--text-primary)]">Operational assessment</h3>
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">Specific findings, indicators, impact and prioritised actions grounded in cited sources.</p>
                </div>
                {investigationId && (
                  <button
                    type="button"
                    onClick={regenerateBriefing}
                    disabled={regenerating}
                    className="btn-dw btn-dw-ghost btn-dw-sm shrink-0 disabled:cursor-wait disabled:opacity-60"
                  >
                    {regenerating ? "Building actionable briefing…" : "Rebuild actionable briefing"}
                  </button>
                )}
              </div>
              {regenerateError && (
                <div className="mb-3 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-dim)] px-3 py-2 text-[10px] text-[var(--danger)]">
                  {regenerateError}
                </div>
              )}
              {briefing ? (
                <BriefingText content={briefing} />
              ) : (
                <p className="text-[12px] leading-5 text-[var(--text-muted)]">
                  No AI interpretation was generated. Use the evidence-backed leads above and the source panel for manual analysis.
                </p>
              )}
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--bg-surface)] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Evidence quality</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-[var(--bg-raised)] p-3">
                  <p className="text-[18px] font-bold text-[var(--success-text)]">{evidenceLeadCount}</p>
                  <p className="text-[8px] uppercase tracking-wider text-[var(--text-muted)]">Usable leads</p>
                </div>
                <div className="rounded-lg bg-[var(--bg-raised)] p-3">
                  <p className="text-[18px] font-bold text-[var(--text-secondary)]">{withheldLeadCount}</p>
                  <p className="text-[8px] uppercase tracking-wider text-[var(--text-muted)]">Withheld noise</p>
                </div>
              </div>
              <p className="mt-3 text-[10px] leading-4 text-[var(--text-muted)]">
                Extraction confidence is the parser’s estimate. Rule-based rank checks format, nearby language and directory noise; it is not a probability. Graph links and repeated mentions do not establish independent confirmation.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-dim)] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-text)]">Geographic scope</p>
                <span className="text-[10px] text-[var(--text-primary)]">{scopeLabel}</span>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                {scopeAssessment
                  ? `${scopeAssessment.level.toUpperCase()} relevance · ${scopeAssessment.documents_matched}/${scopeAssessment.documents_assessed} evidence documents matched. ${scopeAssessment.rationale}`
                  : scopeLabel === "Global"
                    ? "Worldwide analysis with no geographic preference."
                    : "Scope relevance is calculated from collected evidence."}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-dim)] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--warning)]">Important</p>
              <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
                These are investigative leads, not proof. Validate actor names, indicators and relationships against their cited source context before taking action.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {[
                [pagesCrawled, "Pages"],
                [entityCount, "Entities"],
                [relationshipCount, "Edges"],
              ].map(([value, label]) => (
                <div key={label} className="dw-card px-2 py-2 text-center">
                  <div className="text-[13px] font-bold text-[var(--text-primary)]">{value}</div>
                  <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
                </div>
              ))}
            </div>

            <div className="dw-card p-4 text-[11px] leading-5 text-[var(--text-muted)]">
              <p><strong className="text-[var(--text-secondary)]">Entity:</strong> a name, address, wallet, domain, or other item extracted from text.</p>
              <p className="mt-1"><strong className="text-[var(--text-secondary)]">Edge:</strong> two items appeared connected in the evidence; it is not automatically a proven relationship.</p>
              <p className="mt-1"><strong className="text-[var(--text-secondary)]">Confidence:</strong> extraction certainty, not a guarantee that the underlying claim is true.</p>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
