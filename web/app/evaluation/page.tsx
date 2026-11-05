"use client";

import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { ChangeEvent, useState } from "react";

type MetricBlock = {
  precision: number;
  recall: number;
  f1: number;
  false_positive: number;
  false_negative: number;
};

type EvaluationReport = {
  document_count: number;
  overall_status: "pass" | "needs_improvement" | "not_evaluated" | "incomplete" | "demonstration";
  demo?: boolean;
  description?: string;
  dataset_sha256?: string;
  duplicate_documents?: number;
  thresholds_customized?: boolean;
  comparison?: { baseline: { extraction: { exact: MetricBlock } }; improved: { extraction: { exact: MetricBlock } }; delta: MetricBlock };
  errors?: { id: string; false_positives: [string, number, number][]; false_negatives: [string, number, number][] }[];
  extraction: { exact: MetricBlock; partial: MetricBlock };
  classification: {
    threat_category: { accuracy: number; macro_f1: number } | null;
    scope_relevance: { accuracy: number; macro_f1: number } | null;
  };
  summary_usefulness: {
    mean_ratings: Record<string, number | null>;
    fabricated_content_failures: number;
  };
  timing: {
    documents: number;
    manual_seconds: number;
    pipeline_seconds: number;
    reduction: number | null;
  };
  checks: Record<string, boolean | null>;
};

function pct(value: number | null | undefined): string {
  return value == null ? "Not measured" : `${(value * 100).toFixed(1)}%`;
}

function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CheckBadge({ value }: { value: boolean | null }) {
  const style = value === true
    ? "border-[var(--accent-border)] bg-[var(--success-dim)] text-[var(--success-text)]"
    : value === false
      ? "border-[var(--danger)]/30 bg-[var(--danger-dim)] text-[var(--danger)]"
      : "border-[var(--border-dim)] bg-[var(--bg-raised)] text-[var(--text-muted)]";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${style}`}>
      {value === true ? "Pass" : value === false ? "Below target" : "Not measured"}
    </span>
  );
}

export default function EvaluationPage() {
  const [source, setSource] = useState("");
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadTemplate = async () => {
    setError(null);
    try {
    const response = await fetch("/api/evaluation/template", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setError(data?.detail ?? `Could not load template (${response.status})`);
      return;
    }
    setSource(JSON.stringify(data, null, 2));
    setReport(null);
    } catch { setError("Could not load template. Please try again."); }
  };

  const runDemo = async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/evaluation/lead-demo", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Could not run the demonstration");
      setSource(JSON.stringify(payload.dataset, null, 2)); setReport(payload.report);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not run demonstration"); }
    finally { setLoading(false); }
  };

  const runSyntheticProof = async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/evaluation/synthetic-proof", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Could not run the synthetic proof");
      setSource(JSON.stringify(payload.dataset, null, 2)); setReport(payload.report);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not run the synthetic proof"); }
    finally { setLoading(false); }
  };

  const downloadFrozenCorpus = async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/evaluation/synthetic-corpus", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Could not load the frozen corpus");
      downloadJson("TiclaSec_50_Document_Synthetic_Corpus.json", payload);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the frozen corpus"); }
    finally { setLoading(false); }
  };

  const loadFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text()
      .then((text) => {
        JSON.parse(text);
        setSource(text);
        setError(null);
        setReport(null);
      })
      .catch(() => setError("That file is not valid JSON."));
  };

  const evaluate = async () => {
    setError(null);
    setLoading(true);
    try {
      const parsed = JSON.parse(source);
      const payload = Array.isArray(parsed) ? { documents: parsed } : parsed;
      const response = await fetch("/api/evaluation/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.detail ?? `Evaluation failed (${response.status})`);
      setReport(data as EvaluationReport);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Evaluation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-void)] pb-24 lg:pb-0 lg:pl-[288px]">
    <AppNav />
    <main className="px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/research" className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent-text)] hover:underline">Proposal readiness & annotation workflow →</Link>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">Research evaluation workbench</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--text-secondary)]">
              Compare baseline and improved predictions against the same annotated evidence. Default targets follow the proposal; custom targets are labelled. The evaluator makes no AI or Tor requests.
            </p>
          </div>
          <div className="dw-card px-4 py-3 text-right">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Required benchmark</p>
            <p className="mt-1 font-mono text-lg font-bold text-[var(--text-primary)]">50 documents</p>
          </div>
        </div>

        <section className="dw-card mb-5 flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="max-w-2xl"><h2 className="font-bold">Start with reproducible synthetic evidence</h2><p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">The 50-document proof demonstrates the scoring and deterministic evidence-quality gate on unique synthetic texts. The smaller 20-example regression remains available. Neither is a completed human evaluation.</p></div>
          <div className="flex flex-wrap gap-2">
            <button disabled={loading} className="btn-dw max-w-full !whitespace-normal py-2 text-center" onClick={() => void runSyntheticProof()}>Run 50-document synthetic proof</button>
            <button disabled={loading} className="btn-dw btn-dw-ghost max-w-full !whitespace-normal py-2 text-center" onClick={() => void downloadFrozenCorpus()}>Download frozen SYN-001–050 corpus</button>
            <button disabled={loading} className="btn-dw btn-dw-ghost max-w-full !whitespace-normal py-2 text-center" onClick={() => void runDemo()}>Run 20-example regression</button>
          </div>
        </section>
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="dw-card min-w-0 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-bold text-[var(--text-primary)]">Benchmark JSON</h2>
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">Gold annotations, pipeline predictions, human ratings and timing.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void loadTemplate()} className="btn-dw btn-dw-ghost btn-dw-sm">Load template</button>
                <label className="btn-dw btn-dw-ghost btn-dw-sm cursor-pointer">
                  Import file
                  <input type="file" accept="application/json,.json" className="hidden" onChange={loadFile} />
                </label>
              </div>
            </div>
            <textarea
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="Load the template or paste benchmark JSON here…"
              spellCheck={false}
              className="dw-input h-[430px] resize-y font-mono text-[12px] font-semibold leading-5"
            />
            {error && <p className="mt-3 rounded-2xl bg-[var(--danger-dim)] p-3 text-[12px] font-bold text-[var(--danger)]">{error}</p>}
            <button
              onClick={() => void evaluate()}
              disabled={loading || !source.trim()}
              className="btn-dw mt-4 max-w-full !whitespace-normal py-2 text-center"
            >
              {loading ? "Calculating…" : "Calculate research metrics"}
            </button>
            {source && <button className="btn-dw btn-dw-ghost mt-4 sm:ml-2" onClick={() => { try { downloadJson("ticlasec-benchmark.json", JSON.parse(source)); } catch { setError("Correct the JSON before downloading."); } }}>Download dataset</button>}
          </div>

          <aside className="space-y-3 dw-card p-5">
            <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Input requirements</h2>
            {[
              "Exact character spans and entity labels",
              "Threat category and scope-relevance labels",
              "Three analyst ratings for each summary criterion",
              "Manual analyst time and pipeline wall-clock time",
              "Fabricated-content failure flag",
            ].map((item, index) => (
              <div key={item} className="flex gap-3 text-[11px] leading-5 text-[var(--text-secondary)]">
                <span className="font-mono text-[var(--accent-text)]">{index + 1}.</span><span>{item}</span>
              </div>
            ))}
            <div className="rounded-md border border-[var(--warning)]/30 bg-[var(--warning-dim)] p-3 text-[10px] leading-4 text-[var(--text-secondary)]">
              Results are only valid for the submitted benchmark. Do not generalise pilot scores to all dark-web content.
            </div>
          </aside>
        </section>

        {report && (
          <section className="mt-6 dw-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-dim)] pb-4">
              <div>
                <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Evaluation result</h2>
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">{report.document_count} document(s) scored</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${report.overall_status === "pass" ? "border-[var(--accent-border)] bg-[var(--success-dim)] text-[var(--success-text)]" : "border-[var(--warning)]/30 bg-[var(--warning-dim)] text-[var(--warning)]"}`}>{report.overall_status.replace(/_/g, " ")}</span>
              <button className="btn-dw btn-dw-ghost btn-dw-sm" onClick={() => downloadJson("ticlasec-evaluation-result.json", report)}>Download results</button>
            </div>

            {report.demo && <p className="mt-4 rounded-lg bg-[var(--warning-dim)] p-4 text-sm leading-6">Synthetic demonstration — developer-authored examples, not independently annotated research. {report.description || "Human ratings and investigation timings have not been measured."}</p>}
            {report.thresholds_customized && <p className="mt-3 text-sm text-[var(--warning)]">Custom thresholds were used. These results must not be described as passing the original proposal targets.</p>}
            {report.comparison && <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-3 text-left font-bold">Same evidence, same gold labels · exact-span comparison</caption><thead><tr className="border-b border-[var(--border-dim)]"><th className="p-3">Measure</th><th className="p-3">{report.demo ? "Unfiltered candidates" : "Supplied baseline"}</th><th className="p-3">{report.demo ? "Context + format gate" : "Improved predictions"}</th><th className="p-3">Change</th></tr></thead><tbody>
              {([ ["precision", "Precision"], ["recall", "Recall"], ["f1", "F1"], ["false_positive", "False positives"], ["false_negative", "Missed gold entities"] ] as const).map(([key, label]) => {
                const count = key === "false_positive" || key === "false_negative";
                const delta = report.comparison!.delta[key];
                return <tr key={key} className="border-b border-[var(--border-dim)]"><th className="p-3 font-medium">{label}</th><td className="p-3">{count ? report.comparison!.baseline.extraction.exact[key] : pct(report.comparison!.baseline.extraction.exact[key])}</td><td className="p-3">{count ? report.comparison!.improved.extraction.exact[key] : pct(report.comparison!.improved.extraction.exact[key])}</td><td className="p-3">{delta > 0 ? "+" : ""}{count ? delta : `${(delta * 100).toFixed(1)} pp`}</td></tr>;
              })}
            </tbody></table></div>}
            {report.dataset_sha256 && <details className="mt-4 rounded-lg border border-[var(--border-dim)] p-3 text-xs"><summary className="cursor-pointer">Reproducibility fingerprint · {report.duplicate_documents ?? 0} exact duplicate document(s)</summary><p className="mt-2 break-all">SHA-256: {report.dataset_sha256}</p><p className="mt-2">Keep the downloaded dataset and results together. The hash identifies the submitted text, annotations, predictions and measurements; it does not certify their truth.</p></details>}
            {report.errors && <details className="mt-4 rounded-lg border border-[var(--border-dim)] p-3 text-sm"><summary className="cursor-pointer">Inspect remaining extraction errors</summary><div className="mt-3 space-y-2">{report.errors.filter(e => e.false_positives.length || e.false_negatives.length).map(e => <div key={e.id} className="rounded bg-[var(--bg-raised)] p-3"><p className="font-semibold">{e.id}</p>{e.false_positives.map((s, i) => <p key={`fp-${i}`} className="mt-1 text-xs">False positive: {s[0]}, characters {s[1]}–{s[2]}</p>)}{e.false_negatives.map((s, i) => <p key={`fn-${i}`} className="mt-1 text-xs">Missed: {s[0]}, characters {s[1]}–{s[2]}</p>)}</div>)}{!report.errors.some(e => e.false_positives.length || e.false_negatives.length) && <p>No exact-span errors in the supplied predictions.</p>}</div></details>}

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["Exact extraction F1", pct(report.extraction.exact.f1), report.checks.extraction_f1_exact],
                ["Partial extraction F1", pct(report.extraction.partial.f1), report.checks.extraction_f1_partial],
                ["Threat category accuracy", pct(report.classification.threat_category?.accuracy), report.checks.threat_category],
                ["Time reduction", pct(report.timing.reduction), report.checks.investigation_time_reduction],
              ].map(([label, value, check]) => (
                <div key={String(label)} className="rounded-lg border border-[var(--border-dim)] bg-[var(--bg-void)] p-4">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{String(label)}</p>
                  <p className="my-2 font-mono text-xl font-bold text-[var(--text-primary)]">{String(value)}</p>
                  <CheckBadge value={check as boolean | null} />
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {Object.entries(report.checks).map(([name, value]) => (
                <div key={name} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-dim)] bg-[var(--bg-void)] px-3 py-2.5">
                  <span className="text-[10px] font-semibold text-[var(--text-secondary)]">{name.replace(/_/g, " ")}</span>
                  <CheckBadge value={value} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
    </div>
  );
}
