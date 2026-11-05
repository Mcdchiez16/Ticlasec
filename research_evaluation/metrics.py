"""Evaluation ruler for the annotated CTI benchmark.

The implementation deliberately has no database or model dependency.  The
same JSON can be scored from the web workbench, a test, or a dissertation
artifact, which makes the reported results reproducible.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping
from statistics import mean
import hashlib
import json
import math
from typing import Any


DEFAULT_THRESHOLDS = {
    "extraction_precision": 0.80,
    "extraction_recall": 0.70,
    "extraction_f1_exact": 0.75,
    "extraction_f1_partial": 0.80,
    "classification_accuracy": 0.80,
    "classification_macro_f1": 0.70,
    "summary_usefulness": 3.50,
    "max_fabricated_summaries": 5,
    "investigation_time_reduction": 0.50,
}


def _f1(precision: float, recall: float) -> float:
    return 2 * precision * recall / (precision + recall) if precision + recall else 0.0


def _span_key(span: Mapping[str, Any]) -> tuple[str, int, int]:
    return (
        str(span.get("type") or span.get("label") or "").strip().upper(),
        int(span.get("start", -1)),
        int(span.get("end", -1)),
    )


def _valid_span(span: Mapping[str, Any]) -> bool:
    if not isinstance(span, Mapping) or any(type(span.get(k)) is not int for k in ("start", "end")):
        return False
    kind, start, end = _span_key(span)
    return bool(kind and start >= 0 and end > start)


def _exact_counts(gold: Iterable[Mapping[str, Any]], predicted: Iterable[Mapping[str, Any]]) -> tuple[int, int, int]:
    gold_counter = Counter(_span_key(item) for item in gold if _valid_span(item))
    pred_counter = Counter(_span_key(item) for item in predicted if _valid_span(item))
    tp = sum((gold_counter & pred_counter).values())
    return tp, sum(pred_counter.values()) - tp, sum(gold_counter.values()) - tp


def _partial_counts(gold: Iterable[Mapping[str, Any]], predicted: Iterable[Mapping[str, Any]]) -> tuple[int, int, int]:
    gold_items = [_span_key(item) for item in gold if _valid_span(item)]
    predicted_items = [_span_key(item) for item in predicted if _valid_span(item)]
    # Maximum one-to-one overlap matching; greedy matching depends on input order.
    adjacency = [[i for i, (gt, gs, ge) in enumerate(gold_items)
                  if pt == gt and min(pe, ge) > max(ps, gs)]
                 for pt, ps, pe in predicted_items]
    matches: dict[int, int] = {}
    def augment(pred, seen):
        for gold_index in adjacency[pred]:
            if gold_index in seen:
                continue
            seen.add(gold_index)
            if gold_index not in matches or augment(matches[gold_index], seen):
                matches[gold_index] = pred
                return True
        return False
    tp = sum(augment(i, set()) for i in range(len(predicted_items)))
    return tp, len(predicted_items) - tp, len(gold_items) - tp


def _prf(counts: tuple[int, int, int]) -> dict[str, Any]:
    tp, fp, fn = counts
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return {
        "true_positive": tp,
        "false_positive": fp,
        "false_negative": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(_f1(precision, recall), 4),
    }


def _classification(pairs: list[tuple[str, str]]) -> dict[str, Any] | None:
    # Missing predictions are failures, not documents to omit from accuracy.
    clean = [(gold, pred or "__missing_prediction__") for gold, pred in pairs if gold]
    if not clean:
        return None
    labels = sorted({label for pair in clean for label in pair if label != "__missing_prediction__"})
    correct = sum(1 for gold, pred in clean if gold == pred)
    per_label: dict[str, dict[str, float | int]] = {}
    f1_values: list[float] = []
    for label in labels:
        tp = sum(1 for gold, pred in clean if gold == label and pred == label)
        fp = sum(1 for gold, pred in clean if gold != label and pred == label)
        fn = sum(1 for gold, pred in clean if gold == label and pred != label)
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        label_f1 = _f1(precision, recall)
        f1_values.append(label_f1)
        per_label[label] = {
            "support": sum(1 for gold, _ in clean if gold == label),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(label_f1, 4),
        }
    return {
        "documents": len(clean),
        "accuracy": round(correct / len(clean), 4),
        "macro_f1": round(mean(f1_values), 4),
        "per_label": per_label,
    }


def _rating_values(value: Any) -> list[float]:
    raw_values = value if isinstance(value, list) else [value]
    out: list[float] = []
    for raw in raw_values:
        try:
            number = float(raw)
        except (TypeError, ValueError):
            continue
        if 1 <= number <= 5:
            out.append(number)
    return out


def _mean_seconds(value: Any) -> float | None:
    values = value if isinstance(value, list) else [value]
    clean: list[float] = []
    for raw in values:
        try:
            number = float(raw)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number) and number >= 0:
            clean.append(number)
    return mean(clean) if clean else None


def _add_counts(left: tuple[int, int, int], right: tuple[int, int, int]) -> tuple[int, int, int]:
    return tuple(a + b for a, b in zip(left, right))  # type: ignore[return-value]


def evaluate_benchmark(
    documents: Iterable[Mapping[str, Any]],
    thresholds: Mapping[str, float | int] | None = None,
) -> dict[str, Any]:
    """Score annotated documents against the proposal's pre-set thresholds."""

    rows = [dict(row) for row in documents]
    limits = {**DEFAULT_THRESHOLDS, **dict(thresholds or {})}
    if set(limits) != set(DEFAULT_THRESHOLDS) or any(not math.isfinite(float(v)) or v < 0 for v in limits.values()):
        raise ValueError("Thresholds must be known, finite, nonnegative values")
    exact_counts = (0, 0, 0)
    partial_counts = (0, 0, 0)
    categories: list[tuple[str, str]] = []
    relevance: list[tuple[str, str]] = []
    rating_buckets: dict[str, list[float]] = defaultdict(list)
    fabricated_failures = 0
    fabrication_assessments = 0
    rating_documents = defaultdict(int)
    manual_total = 0.0
    pipeline_total = 0.0
    timed_documents = 0
    annotator_counts = defaultdict(lambda: (0, 0, 0))
    annotator_documents = defaultdict(int)

    for row in rows:
        for method in ("gold", "prediction"):
            block = row.get(method, {})
            if not isinstance(block, Mapping) or not isinstance(block.get("entities", []), list):
                raise ValueError(f"{method}.entities must be an array of typed character spans")
            if len(block.get("entities", [])) > 500:
                raise ValueError("At most 500 entity spans per document and method are supported")
            if any(not _valid_span(span) for span in block.get("entities", [])):
                raise ValueError(f"Invalid {method} character span")
        gold = row.get("gold") if isinstance(row.get("gold"), Mapping) else {}
        prediction = row.get("prediction") if isinstance(row.get("prediction"), Mapping) else {}
        gold_entities = gold.get("entities") if isinstance(gold.get("entities"), list) else []
        pred_entities = prediction.get("entities") if isinstance(prediction.get("entities"), list) else []
        exact_counts = _add_counts(exact_counts, _exact_counts(gold_entities, pred_entities))
        partial_counts = _add_counts(partial_counts, _partial_counts(gold_entities, pred_entities))

        categories.append((
            str(gold.get("threat_category") or ""),
            str(prediction.get("threat_category") or ""),
        ))
        relevance.append((
            str(gold.get("scope_relevance") or gold.get("zambia_relevance") or ""),
            str(prediction.get("scope_relevance") or prediction.get("zambia_relevance") or ""),
        ))

        ratings = row.get("summary_ratings")
        if isinstance(ratings, Mapping):
            for criterion in ("accuracy", "completeness", "actionability", "absence_of_hallucination"):
                values = _rating_values(ratings.get(criterion))
                rating_buckets[criterion].extend(values)
                rating_documents[criterion] += len(values) >= 3
        if isinstance(row.get("fabricated_content"), bool):
            fabrication_assessments += 1
        if row.get("fabricated_content") is True:
            fabricated_failures += 1

        manual_seconds = _mean_seconds(row.get("manual_seconds"))
        pipeline_seconds = _mean_seconds(row.get("pipeline_seconds"))
        if manual_seconds is not None and pipeline_seconds is not None:
            manual_total += manual_seconds
            pipeline_total += pipeline_seconds
            timed_documents += 1

        manual_entities = row.get("manual_entities")
        if isinstance(manual_entities, list):
            for index, annotation in enumerate(manual_entities):
                if isinstance(annotation, list):
                    annotator_counts[index] = _add_counts(annotator_counts[index], _exact_counts(gold_entities, annotation))
                    annotator_documents[index] += 1

    exact = _prf(exact_counts)
    partial = _prf(partial_counts)
    category_metrics = _classification(categories)
    relevance_metrics = _classification(relevance)
    summary_means = {
        criterion: round(mean(values), 3) if values else None
        for criterion, values in rating_buckets.items()
    }
    for criterion in ("accuracy", "completeness", "actionability", "absence_of_hallucination"):
        summary_means.setdefault(criterion, None)

    time_reduction = (
        (manual_total - pipeline_total) / manual_total if manual_total > 0 else None
    )
    annotator_f1 = [_prf(counts)["f1"] for index, counts in annotator_counts.items()
                    if annotator_documents[index] == len(rows)]
    mean_manual_f1 = round(mean(annotator_f1), 4) if annotator_f1 else None

    checks: dict[str, bool | None] = {
        "benchmark_size": len(rows) >= 50,
        "extraction_precision": exact["precision"] >= limits["extraction_precision"],
        "extraction_recall": exact["recall"] >= limits["extraction_recall"],
        "extraction_f1_exact": exact["f1"] >= limits["extraction_f1_exact"],
        "extraction_f1_partial": partial["f1"] >= limits["extraction_f1_partial"],
        "threat_category": (
            category_metrics["accuracy"] >= limits["classification_accuracy"]
            and category_metrics["macro_f1"] >= limits["classification_macro_f1"]
        ) if category_metrics and category_metrics["documents"] == len(rows) else None,
        "scope_relevance": (
            relevance_metrics["accuracy"] >= limits["classification_accuracy"]
            and relevance_metrics["macro_f1"] >= limits["classification_macro_f1"]
        ) if relevance_metrics and relevance_metrics["documents"] == len(rows) else None,
        "summary_usefulness": (
            all(
                value is not None and value >= limits["summary_usefulness"]
                for value in summary_means.values()
            )
            and fabricated_failures <= limits["max_fabricated_summaries"]
        ) if rows and fabrication_assessments == len(rows) and all(
            rating_documents[criterion] == len(rows) for criterion in summary_means
        ) else None,
        "investigation_time_reduction": (
            time_reduction >= limits["investigation_time_reduction"]
        ) if time_reduction is not None and timed_documents == len(rows) else None,
        "manual_analyst_parity": (
            exact["f1"] >= mean_manual_f1
        ) if mean_manual_f1 is not None else None,
    }
    completed_checks = [value for value in checks.values() if value is not None]

    return {
        "schema_version": "1.1",
        "document_count": len(rows),
        "thresholds": limits,
        "extraction": {"exact": exact, "partial": partial},
        "classification": {
            "threat_category": category_metrics,
            "scope_relevance": relevance_metrics,
        },
        "summary_usefulness": {
            "mean_ratings": summary_means,
            "fabricated_content_failures": fabricated_failures,
            "fabrication_assessments": fabrication_assessments,
            "rated_documents": dict(rating_documents),
        },
        "timing": {
            "documents": timed_documents,
            "manual_seconds": round(manual_total, 3),
            "pipeline_seconds": round(pipeline_total, 3),
            "reduction": round(time_reduction, 4) if time_reduction is not None else None,
        },
        "manual_baseline": {"mean_annotator_f1": mean_manual_f1, "complete_annotators": len(annotator_f1),
                            "f1_percentage_difference": round((exact["f1"] - mean_manual_f1) / mean_manual_f1 * 100, 3) if mean_manual_f1 else None},
        "checks": checks,
        "overall_status": (
            "not_evaluated"
            if not completed_checks
            else "needs_improvement" if not all(completed_checks)
            else "incomplete" if any(value is None for value in checks.values())
            else "pass"
        ),
    }


def compare_benchmark(documents: Iterable[Mapping[str, Any]], thresholds=None) -> dict:
    """Compare supplied predictions on identical, hashed documents and gold labels."""
    rows = [dict(row) for row in documents]
    identifiers = [str(row.get("id") or "").strip() for row in rows]
    if not all(identifiers) or len(set(identifiers)) != len(rows):
        raise ValueError("Each document needs a unique nonempty id")
    if any(not isinstance(row.get("text"), str) or not row["text"].strip() for row in rows):
        raise ValueError("Each document needs its sanitized text for reproducible comparison")
    if any(not isinstance(row.get("baseline_prediction"), Mapping) or not isinstance(row.get("prediction"), Mapping)
           or not isinstance(row.get("gold"), Mapping) for row in rows):
        raise ValueError("Each document needs gold, baseline_prediction and prediction objects")
    manifest = []
    errors = []
    for row in rows:
        digest = hashlib.sha256(row["text"].encode()).hexdigest()
        if row.get("content_sha256") and row["content_sha256"] != digest:
            raise ValueError(f"Content hash mismatch for {row['id']}")
        for key in ("gold", "baseline_prediction", "prediction"):
            if not isinstance(row[key].get("entities"), list):
                raise ValueError(f"{row['id']}: {key}.entities must be an array")
            for span in row[key]["entities"]:
                if not isinstance(span, Mapping) or not _valid_span(span) or int(span["end"]) > len(row["text"]):
                    raise ValueError(f"{row['id']}: invalid {key} character span")
        manifest.append({"id": row["id"], "content_sha256": digest, "source_class": row.get("source_class", "unspecified")})
        gold = Counter(_span_key(s) for s in row["gold"]["entities"])
        pred = Counter(_span_key(s) for s in row["prediction"]["entities"])
        errors.append({"id": row["id"], "false_positives": list((pred - gold).elements()),
                       "false_negatives": list((gold - pred).elements())})
    baseline_rows = [{**row, "prediction": row["baseline_prediction"],
                      "pipeline_seconds": row.get("baseline_seconds"),
                      "summary_ratings": row.get("baseline_summary_ratings"),
                      "fabricated_content": row.get("baseline_fabricated_content")} for row in rows]
    baseline = evaluate_benchmark(baseline_rows, thresholds)
    improved = evaluate_benchmark(rows, thresholds)
    b, p = baseline["extraction"]["exact"], improved["extraction"]["exact"]
    canonical = json.dumps(rows, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    duplicate_count = len(manifest) - len({item["content_sha256"] for item in manifest})
    for report in (baseline, improved):
        report["checks"]["unique_benchmark_documents"] = len(rows) - duplicate_count >= 50
        if not report["checks"]["unique_benchmark_documents"]:
            report["overall_status"] = "needs_improvement"
    return {**improved, "comparison": {"baseline": baseline, "improved": improved,
        "delta": {key: round(p[key] - b[key], 4) for key in ("precision", "recall", "f1", "false_positive", "false_negative")}},
        "manifest": manifest, "duplicate_documents": duplicate_count, "dataset_sha256": hashlib.sha256(canonical.encode()).hexdigest(),
        "errors": errors, "evaluation_version": "2.0", "thresholds_customized": bool(thresholds and dict(thresholds) != DEFAULT_THRESHOLDS),
        "limitations": "Scores describe only the supplied corpus. Predictions and annotations are caller supplied; human adjudication and measured timings remain necessary."}
