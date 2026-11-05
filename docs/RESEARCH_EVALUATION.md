# Research Evaluation Workbench

For the strict Zambia proposal workflow (corpus composition, blinded annotation,
agreement, frozen gold, encrypted artifacts, measured runs, MFA and outstanding
approvals), use `/research` and [Submission readiness](SUBMISSION_READINESS.md).
This page's exploratory scorer alone does **not** certify proposal compliance.

The authenticated `/evaluation` page scores a human-annotated JSON benchmark
without calling Tor or an AI provider. The same pure evaluator is implemented
in `research_evaluation/metrics.py` so results are reproducible outside the UI.

## Input

Each document contains:

- `gold.entities` and `prediction.entities`, with `type`, `start` and `end`;
- gold and predicted `threat_category`;
- gold and predicted `scope_relevance` (`zambia_relevance` is accepted as a
  proposal-compatible alias);
- `summary_ratings` from the annotators on accuracy, completeness,
  actionability and absence of hallucination;
- `fabricated_content`, a boolean failure flag;
- `manual_seconds`, preferably the two independent analyst times; and
- `pipeline_seconds`, measured wall-clock time for the same document.

Use **Load template** in the workbench to obtain a valid example. The formal
study should contain 50 documents and preserve a cryptographic hash of the
submitted dataset alongside the generated result.

The template contains **no invented human ratings, predictions or timings**.
Fill those fields only after annotation and measurement. Summary completion
requires at least three ratings per criterion per document and an explicit
fabrication assessment. Classification and timing checks require coverage of
the entire corpus. Missing predictions count as classification failures.
Manual annotators must keep a consistent position in `manual_entities` across
documents; parity compares corpus-level micro-F1, averaged over annotators
with complete coverage. Partial spans use maximum one-to-one overlap matching.

## Baseline comparison and repeatable demonstration

Choose **Run 50-document synthetic proof** on `/evaluation` to demonstrate the
benchmark-size, uniqueness, hashing, scoring and fixed-threshold checks on 50
developer-authored synthetic documents.  It also exposes the remaining false
negatives.  This is technical demonstration evidence for the deterministic
context-and-format gate, not independent human annotation, LLM accuracy or
real-world dark-web performance.  Summary ratings and timings remain unmeasured.

Choose **Run evidence-quality demo** on `/evaluation` to run 20 synthetic,
developer-authored regression examples through the actual context/format gate.
The baseline is the **unfiltered candidate list**, not Robin or upstream
TiclaSec. This tests candidate filtering, not the complete extraction model.
It deliberately includes a missed low-confidence lead and an exact copied
document. No AI calls, Tor requests, human ratings or investigation timings
are generated. The status is always **demonstration**, not research success.

Download both dataset and results. To reproduce the same comparison offline:

```sh
python -m research_evaluation /path/to/ticlasec-benchmark.json
```

With no argument, the command runs the bundled demonstration. Comparison
inputs add these fields to every document:

- `id`: a unique, nonempty document identifier;
- `text`: the same sanitized evidence seen by both pipelines;
- `source_class`: e.g. `synthetic` or `authorized_collected`;
- `gold.entities`: independently adjudicated, typed character spans;
- `baseline_prediction` and `prediction`: outputs of both methods on that text;
- optional `content_sha256`: checked against the exact UTF-8 text;
- optional `baseline_seconds`, `baseline_summary_ratings`, and
  `baseline_fabricated_content`: actual baseline measurements.

Offsets are zero-based, end-exclusive **Unicode character** indexes (not UTF-8
byte offsets). Comparison rejects missing/duplicate IDs, out-of-range spans,
and mismatched hashes. Exported results include the corpus hash, per-document
text hashes, exact duplicate count, baseline/improved scores, metric changes,
and remaining false-positive/false-negative spans. At least 50 unique text
documents are required for the comparison's benchmark-size check. Near-copy
and train/test leakage assessment still require researcher review.

These checks validate submitted data structure, not the honesty or independent
origin of annotations. Keep the evaluation set separate from tuning examples
and document human annotation disagreements and adjudication.

## Fixed thresholds

The evaluator uses the pre-registered proposal thresholds: precision 0.80,
recall 0.70, exact F1 0.75, partial F1 0.80, classification accuracy 0.80,
classification macro-F1 0.70, every summary criterion 3.5/5, no more than five
fabricated-summary failures, and at least 50% investigation-time reduction.

Missing human ratings or timing are shown as **Not measured**, not silently
treated as a pass. Results apply only to the submitted pilot benchmark and must
not be presented as population-wide accuracy.

Custom thresholds are accepted for exploratory analysis and labelled as such.
An exploratory pass must not be presented as passing the original targets.
