"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { EntityDetailsPanel } from "@/components/EntityDetailsPanel";
import { InvestigationSummary } from "@/components/InvestigationSummary";
import { AiBriefingPanel } from "@/components/AiBriefingPanel";
import { EvidencePanel } from "@/components/EvidencePanel";
import { InvestigationAssistant } from "@/components/InvestigationAssistant";
import { ScrapedLinksPanel } from "@/components/ScrapedLinksPanel";
import { EvidenceReviewPanel } from "@/components/EvidenceReviewPanel";
import { ConnectionMap } from "@/components/connections/ConnectionMap";
import { InfrastructureClusters } from "@/components/InfrastructureClusters";
import { SourcesPanel } from "@/components/SourcesPanel";
import { TemporalAnalysisPanel } from "@/components/TemporalAnalysisPanel";
import { OpsecPanel } from "@/components/OpsecPanel";
import { StylometryPanel } from "@/components/StylometryPanel";
import { useGraphData } from "@/lib/hooks/useGraphData";
import { useInvestigationPolling } from "@/lib/hooks/useInvestigationPolling";
import { InvestigationLoadingScreen } from "@/components/InvestigationLoadingScreen";
import type {
  InvestigationEntity,
  InvestigationSummary as Inv,
} from "@/lib/types/investigation";

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export default function InvestigationPage() {
  const params = useParams();
  const investigationParamId = typeof params.id === "string" ? params.id : "";

  const [investigation, setInvestigation] = useState<Inv | null>(null);
  const [entities, setEntities] = useState<InvestigationEntity[]>([]);
  const [, setEntitiesLoading] = useState(true);
  const [detailsEntity, setDetailsEntity] = useState<InvestigationEntity | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
  const [strongEdgesOnly, setStrongEdgesOnly] = useState(true);
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);
  const [minConfidence, setMinConfidence] = useState(0.75);
  const [debouncedMinConfidence, setDebouncedMinConfidence] = useState(0.75);
  const [entityMinConfidence, setEntityMinConfidence] = useState(0.75);
  const [defangEnabled, setDefangEnabled] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [graphUpdatedAt, setGraphUpdatedAt] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<"briefing" | "guided" | "sources" | "analyst" | "review">("briefing");
  const [reviewEntityId, setReviewEntityId] = useState<string>("");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMinConfidenceChange = useCallback((value: number) => {
    setMinConfidence(value);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedMinConfidence(value);
    }, 500);
  }, []);

  const handleEntityMinConfidenceChange = useCallback((value: number) => {
    setEntityMinConfidence(value);
    void fetchEntities(value);
  }, []);

  const {
    status: graphStatus,
    data: graphData,
    error: graphError,
    refetch: refetchGraph,
  } = useGraphData(investigationParamId, debouncedMinConfidence);

  const processing =
    investigation &&
    (investigation.status === "pending" || investigation.status === "processing");

  const handleCancelRequest = useCallback(() => {
    if (!window.confirm("Cancel this investigation? Partial results collected so far will be kept.")) return;
    setCancelling(true);

    fetch(`/api/investigations/${encodeURIComponent(investigationParamId)}/cancel`, {
      method: "POST",
      headers: {  },
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg = (data as { detail?: string }).detail ?? `Error ${res.status}`;
          alert(msg);
          setCancelling(false);
        }
      })
      .catch((err) => {
        alert(err instanceof Error ? err.message : "Failed to cancel");
        setCancelling(false);
      });
  }, [investigationParamId]);

  const fetchInvestigation = useCallback(async () => {
    if (!investigationParamId) return;

    const res = await fetch(`/api/investigations/${encodeURIComponent(investigationParamId)}`, {
      cache: "no-store",
      headers: {  },
    });
    if (res.ok) {
      const data = (await res.json()) as Inv;
      setInvestigation(data);
    }
  }, [investigationParamId]);

  const fetchEntities = useCallback(async (minConf?: number, freshness?: string) => {
    if (!investigationParamId) return;
    setEntitiesLoading(true);
    try {

      const conf = minConf !== undefined ? minConf : entityMinConfidence;
      // Keep the client within the API's paginated maximum.  The previous
      // 1000 request was rejected with HTTP 422 before the sidebar could
      // render any entities or their priority scores.
      const qs = new URLSearchParams({ limit: "100", min_confidence: conf.toString(), defang: defangEnabled.toString() });
      if (freshness && freshness !== "expired") {
        qs.set("freshness_exclude", freshness);
      } else if (freshness === "expired") {
        qs.set("freshness_exclude", "expired");
      }
      const res = await fetch(
        `/api/investigations/${encodeURIComponent(investigationParamId)}/entities?${qs}`,
        { cache: "no-store", headers: {  } }
      );
      if (res.ok) {
        const json = await res.json();
        const items = (Array.isArray(json) ? json : (json.items ?? [])) as InvestigationEntity[];
        setEntities(items);
      }
    } finally {
      setEntitiesLoading(false);
    }
  }, [investigationParamId, entityMinConfidence, defangEnabled]);

  useEffect(() => {
    void fetchInvestigation();
    void fetchEntities();
  }, [fetchInvestigation, fetchEntities]);

  useInvestigationPolling({
    investigationId: investigationParamId,
    enabled: Boolean(processing) || cancelling,
    onUpdate: (inv) => {
      setInvestigation(inv);
      if (inv.status === "completed" || inv.status === "failed" || inv.status === "cancelled") {
        setCancelling(false);
        void fetchEntities();
        void refetchGraph();
      }
    },
  });

  const openEntityRecord = useCallback((entity: InvestigationEntity) => {
    setDetailsEntity(entity);
    setDetailsOpen(true);
  }, []);

  const refinedSearch = investigation?.refined_query?.trim() || "";
  const refinedSearchIsComplete = !/\b(?:last|past|previous)\s+\d+$/i.test(refinedSearch);

  // note when the graph data last changed, so the map can say how fresh it is
  useEffect(() => {
    if (graphStatus === "ready") setGraphUpdatedAt(new Date());
  }, [graphData, graphStatus]);

  const handleRefreshMap = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchGraph(), fetchEntities()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchGraph, fetchEntities]);

  const handleDownloadCsv = useCallback(() => {

    const url = `/api/investigations/${encodeURIComponent(investigationParamId)}/entities/export/csv`;
    fetch(url, {
      headers: {  },
    })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `atcis_${investigationParamId}_entities.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      });
  }, [investigationParamId]);

  if (!investigationParamId || !investigation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-void)]">
        <div className="flex flex-col items-center gap-6">
          <div className="h-10 w-10 animate-spin rounded-full border border-[var(--accent)] border-t-transparent shadow-[0_0_15px_var(--accent-dim)]" />
          <div className="space-y-1 text-center">
            <p className="font-heading text-lg font-bold tracking-tight text-[var(--text-primary)]">Initializing Intelligence Workspace</p>
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Verifying node authorization...</p>
          </div>
        </div>
      </div>
    );
  }

  if (investigation.status === "completed_no_results") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-void)] px-4">
        <div className="flex flex-col items-center gap-6 dw-card p-8 shadow-xl max-w-md text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-raised)]">
            <svg className="h-8 w-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="space-y-3">
            <h3 className="text-xl font-bold text-[var(--text-primary)]">No intelligence results found</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              This query returned only directory or index pages. Try a more specific query such as a threat actor name, malware family, or CVE identifier.
            </p>
            {investigation.refined_query && investigation.refined_query !== investigation.query && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Your query was interpreted as: <span className="text-[var(--accent-text)]">{investigation.refined_query}</span>
              </p>
            )}
          </div>
          <button
            onClick={() => window.location.href = "/"}
            className="mt-2 px-6 py-2.5 rounded-md bg-[var(--accent)] text-[var(--text-inverse)] text-sm font-bold hover:bg-[var(--accent-hover)] transition-colors"
          >
            New investigation
          </button>
        </div>
      </div>
    );
  }

  if (processing) {
    return (
      <InvestigationLoadingScreen
        investigationId={investigationParamId}
        query={investigation.query}
        currentStep={investigation.current_step}
        createdAt={investigation.created_at}
        entityCount={investigation.entity_count}
        pageCount={investigation.page_count}
        onCancelRequest={handleCancelRequest}
        cancelling={cancelling}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-void)] font-sans">
      {/* Header Bar */}
      <InvestigationSummary
        investigation={investigation}
        investigationParamId={investigationParamId}
        entityCount={investigation.entity_count ?? entities.length}
        relationshipCount={graphData?.edges?.length ?? 0}
        pagesCrawled={investigation.page_count ?? 0}
        lastUpdatedLabel={formatRelative(investigation.created_at)}
      />

      {investigation.status === "cancelled" && (
        <div className="flex items-center gap-3 border-b border-[var(--warning)]/30 bg-[var(--warning-dim)] px-6 py-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)] shrink-0" />
          <span className="text-[12px] font-semibold text-[var(--warning)]">
            Investigation cancelled — showing partial results
          </span>
        </div>
      )}

      {refinedSearch && refinedSearch !== investigation.query && refinedSearchIsComplete && (
        <div className="shrink-0 border-b border-[var(--border-dim)] bg-[var(--bg-surface)] px-5 py-2.5 lg:px-8">
          <div className="mx-auto flex max-w-[1600px] items-center gap-3">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">AI-refined search</span>
            <span className="min-w-0 truncate rounded-full border border-[var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1 text-[11px] font-semibold text-[var(--accent-text)]" title={refinedSearch}>{refinedSearch}</span>
          </div>
        </div>
      )}

      <div className="shrink-0 border-b border-[var(--border-dim)] bg-[var(--bg-surface)] px-5 py-3 lg:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[var(--text-primary)]">
              {viewMode === "briefing" ? "Threat intelligence briefing" : viewMode === "guided" ? "Guided investigation" : viewMode === "sources" ? "Collected source links" : viewMode === "review" ? "Evidence review & case report" : "Connection map"}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              {viewMode === "briefing"
                ? "Review named threats, actors, indicators and recommended actions"
                : viewMode === "guided"
                  ? "Ask questions and validate every answer against source evidence"
                  : viewMode === "sources"
                    ? "Review every page collected during this investigation"
                    : viewMode === "review" ? "Inspect source passages and record analyst decisions"
                    : "Trace relationships between actors, threats and infrastructure"}
            </p>
          </div>
          <div className="grid w-full grid-cols-3 gap-1 rounded-xl border border-[var(--border-dim)] bg-[var(--bg-raised)] p-1 sm:grid-cols-5 2xl:w-auto" role="tablist" aria-label="Investigation workspace">
            {[
              { id: "briefing" as const, label: "Briefing", detail: "Findings" },
              { id: "guided" as const, label: "Ask AI", detail: "Evidence Q&A" },
              { id: "sources" as const, label: "Scraped Links", detail: `${investigation.page_count ?? 0} pages` },
              { id: "analyst" as const, label: "Connection Map", detail: "Entity relationships" },
              { id: "review" as const, label: "Review & Report", detail: "Evidence decisions" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={viewMode === tab.id}
                onClick={() => setViewMode(tab.id)}
                className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-left transition-all lg:min-w-[128px] lg:px-4 ${viewMode === tab.id ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm ring-1 ring-[var(--border-dim)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
              >
                <span className="block text-[11px] font-bold">{tab.label}</span>
                <span className="mt-0.5 hidden text-[9px] text-[var(--text-muted)] sm:block">{tab.detail}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewMode === "briefing" ? (
        <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-void)] custom-scrollbar">
          <AiBriefingPanel
            summary={investigation.summary}
            query={investigation.query}
            entityCount={investigation.entity_count ?? entities.length}
            relationshipCount={graphData?.edges?.length ?? 0}
            pagesCrawled={investigation.page_count ?? 0}
            entities={entities}
            investigationId={investigationParamId}
            onReviewEvidence={(entityId) => { setReviewEntityId(entityId); setViewMode("review"); }}
            onSummaryUpdated={(summary) => setInvestigation(current => current ? { ...current, summary } : current)}
            scopeLabel={investigation.intelligence_scope?.label ?? "Global"}
            scopeAssessment={investigation.scope_assessment}
          />
        </main>
      ) : viewMode === "review" ? (
        <main className="min-h-0 flex-1">
          <EvidenceReviewPanel investigationId={investigationParamId} initialEntityId={reviewEntityId} />
        </main>
      ) : viewMode === "guided" ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_430px] xl:overflow-hidden">
          <div className="min-h-[560px] xl:min-h-0">
            <InvestigationAssistant investigationId={investigationParamId} />
          </div>
          <div className="min-h-[560px] xl:min-h-0">
            <EvidencePanel investigationId={investigationParamId} />
          </div>
        </div>
      ) : viewMode === "sources" ? (
        <div className="min-h-0 flex-1">
          <ScrapedLinksPanel investigationId={investigationParamId} />
        </div>
      ) : (
        <>

      {/* Connection map: entity list, map and details in one white workspace */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[var(--bg-surface)]" id="entities">
        <ConnectionMap
          data={graphData}
          entities={entities}
          loading={graphStatus === "loading" || graphStatus === "idle"}
          error={graphError}
          defang={defangEnabled}
          onDefangChange={setDefangEnabled}
          minConfidence={minConfidence}
          onMinConfidenceChange={(value) => {
            handleMinConfidenceChange(value);
            handleEntityMinConfidenceChange(value);
          }}
          strongOnly={strongEdgesOnly}
          onStrongOnlyChange={setStrongEdgesOnly}
          selectedId={selectedGraphNodeId}
          onSelect={setSelectedGraphNodeId}
          onOpenRecord={openEntityRecord}
          onRefresh={handleRefreshMap}
          refreshing={refreshing}
          updatedAt={graphUpdatedAt}
          onDownloadCsv={handleDownloadCsv}
        />

        <EntityDetailsPanel
          entity={detailsEntity}
          investigationId={investigationParamId}
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          onViewInGraph={() => {
            if (detailsEntity) setSelectedGraphNodeId(detailsEntity.graph_node_id);
            setDetailsOpen(false);
          }}
          onExportThisEntity={() => {}}
          onBackdropClick={() => setDetailsOpen(false)}
        />
      </div>

      {/* Analysis Panels Section */}
      <div className="shrink-0 border-t border-[var(--border-dim)] bg-[var(--bg-surface)]">
        <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto custom-scrollbar">
            <span className="mr-2 shrink-0 text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Advanced analysis</span>
            {[
              { id: "temporal", label: "Timeline" },
              { id: "opsec", label: "OPSEC" },
              { id: "stylometry", label: "Linguistics" },
              ...(investigation.infrastructure_clusters && investigation.infrastructure_clusters.length > 0
                ? [{ id: "infrastructure", label: `Infrastructure (${investigation.infrastructure_clusters.length})` }]
                : []),
              ...(investigation.sources_used && Object.keys(investigation.sources_used).length > 0
                ? [{ id: "sources", label: "Collector status" }]
                : []),
            ].map(panel => (
              <button
                key={panel.id}
                onClick={() => setExpandedPanel(expandedPanel === panel.id ? null : panel.id)}
                className={`flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-[9px] font-bold uppercase tracking-wider transition-all ${expandedPanel === panel.id ? "bg-[var(--accent-dim)] text-[var(--accent-text)] border border-[var(--accent-border)]" : "border border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-raised)] hover:text-[var(--text-primary)] hover:border-[var(--border-dim)]"}`}
              >
                <span className={`transition-transform duration-300 inline-block ${expandedPanel === panel.id ? "rotate-90" : ""}`}>▶</span>
                {panel.label}
              </button>
            ))}
          </div>
          {expandedPanel && (
            <button
              onClick={() => setExpandedPanel(null)}
              className="flex items-center gap-1.5 px-3 h-7 rounded-md text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] transition-all"
            >
              <span className="text-[12px] leading-none">✕</span>
              Close
            </button>
          )}
        </div>

        {expandedPanel && (
          <div className="h-[320px] overflow-y-auto bg-[var(--bg-void)] px-6 py-6 border-t border-[var(--border-dim)] animate-in slide-in-from-bottom-2 duration-300 custom-scrollbar">
            {expandedPanel === "temporal" && <TemporalAnalysisPanel investigationId={investigationParamId} />}
            {expandedPanel === "opsec" && <OpsecPanel entityId={detailsEntity?.id || ""} data={null} loading={false} error={null} onExpand={() => {}} />}
            {expandedPanel === "stylometry" && <StylometryPanel entityId={detailsEntity?.id || ""} data={null} loading={false} error={null} onExpand={() => {}} />}
            {expandedPanel === "infrastructure" && (
              <InfrastructureClusters
                clusters={investigation.infrastructure_clusters ?? []}
                onHighlightDomains={(domains) => {
                  const match = entities.find(e =>
                    domains.some(d => e.value?.includes(d))
                  );
                  if (match) {
                    setSelectedGraphNodeId(match.graph_node_id);
                  }
                }}
              />
            )}
            {expandedPanel === "sources" && (
              <SourcesPanel sourcesUsed={investigation.sources_used ?? {}} />
            )}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
