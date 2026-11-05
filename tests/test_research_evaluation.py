from research_evaluation import evaluate_benchmark


def _span(kind: str, start: int, end: int) -> dict:
    return {"type": kind, "start": start, "end": end, "text": "x"}


def test_perfect_benchmark_passes_complete_metrics():
    documents = []
    for index in range(50):
        documents.append(
            {
                "id": f"DOC-{index:03d}",
                "gold": {
                    "entities": [_span("DOMAIN_URL", 10, 20)],
                    "threat_category": "data_breach",
                    "scope_relevance": "relevant",
                },
                "prediction": {
                    "entities": [_span("DOMAIN_URL", 10, 20)],
                    "threat_category": "data_breach",
                    "scope_relevance": "relevant",
                },
                "summary_ratings": {
                    "accuracy": [4, 5, 4],
                    "completeness": [4, 4, 4],
                    "actionability": [4, 4, 5],
                    "absence_of_hallucination": [5, 5, 5],
                },
                "fabricated_content": False,
                "manual_seconds": [100, 120],
                "pipeline_seconds": 20,
                "manual_entities": [[_span("DOMAIN_URL", 10, 20)]],
            }
        )

    report = evaluate_benchmark(documents)
    assert report["overall_status"] == "pass"
    assert report["extraction"]["exact"]["f1"] == 1.0
    assert report["timing"]["reduction"] > 0.5
    assert report["checks"]["manual_analyst_parity"] is True


def test_partial_overlap_is_not_an_exact_match():
    report = evaluate_benchmark(
        [
            {
                "gold": {"entities": [_span("DOMAIN_URL", 10, 20)]},
                "prediction": {"entities": [_span("DOMAIN_URL", 12, 22)]},
            }
        ]
    )
    assert report["extraction"]["exact"]["f1"] == 0.0
    assert report["extraction"]["partial"]["f1"] == 1.0


def test_missing_human_measures_are_reported_as_not_evaluated():
    report = evaluate_benchmark(
        [{"gold": {"entities": []}, "prediction": {"entities": []}}]
    )
    assert report["checks"]["summary_usefulness"] is None
    assert report["checks"]["investigation_time_reduction"] is None


def test_scope_relevance_accepts_proposal_zambia_field_alias():
    report = evaluate_benchmark(
        [
            {
                "gold": {"entities": [], "zambia_relevance": "relevant"},
                "prediction": {"entities": [], "zambia_relevance": "relevant"},
            }
        ]
    )
    assert report["classification"]["scope_relevance"]["accuracy"] == 1.0


def test_missing_class_prediction_is_counted_as_a_failure():
    report = evaluate_benchmark([
        {"gold": {"threat_category": "breach"}, "prediction": {"threat_category": "breach"}},
        {"gold": {"threat_category": "breach"}, "prediction": {}},
    ])
    assert report["classification"]["threat_category"]["accuracy"] == .5


def test_partial_matching_is_maximal_and_order_independent():
    gold = [_span("DOMAIN", 0, 4), _span("DOMAIN", 4, 10)]
    predicted = [_span("DOMAIN", 0, 10), _span("DOMAIN", 5, 9)]
    for spans in (predicted, list(reversed(predicted))):
        report = evaluate_benchmark([{"gold": {"entities": gold}, "prediction": {"entities": spans}}])
        assert report["extraction"]["partial"]["true_positive"] == 2


def test_one_rated_document_does_not_complete_a_corpus():
    rows = [{"gold": {}, "prediction": {}} for _ in range(50)]
    rows[0].update(summary_ratings={key: [5, 5, 5] for key in ("accuracy", "completeness", "actionability", "absence_of_hallucination")}, fabricated_content=False, manual_seconds=100, pipeline_seconds=10)
    report = evaluate_benchmark(rows)
    assert report["checks"]["summary_usefulness"] is None
    assert report["checks"]["investigation_time_reduction"] is None
    assert report["overall_status"] != "pass"


def test_demo_is_reproducible_and_discloses_missed_lead_and_copy():
    from research_evaluation.lead_demo import run_demo
    a, b = run_demo(), run_demo()
    assert a == b
    report = a["report"]
    assert report["overall_status"] == "demonstration"
    assert report["duplicate_documents"] == 1
    assert report["comparison"]["delta"]["false_positive"] < 0
    assert report["extraction"]["exact"]["false_negative"] >= 1
    assert report["checks"]["summary_usefulness"] is None
    assert report["checks"]["investigation_time_reduction"] is None


def test_fifty_document_synthetic_proof_is_unique_reproducible_and_disclosed():
    from research_evaluation.synthetic_proof import run_synthetic_proof

    first, second = run_synthetic_proof(), run_synthetic_proof()
    assert first == second
    dataset, report = first["dataset"], first["report"]
    assert len(dataset["documents"]) == 50
    assert len({row["id"] for row in dataset["documents"]}) == 50
    assert len({row["text"] for row in dataset["documents"]}) == 50
    assert report["overall_status"] == "demonstration"
    assert report["checks"]["benchmark_size"] is True
    assert report["checks"]["unique_benchmark_documents"] is True
    assert report["checks"]["extraction_precision"] is True
    assert report["checks"]["extraction_recall"] is True
    assert report["checks"]["extraction_f1_exact"] is True
    assert report["checks"]["summary_usefulness"] is None
    assert report["checks"]["investigation_time_reduction"] is None
    assert all(row["human_annotation_status"] == "not independently annotated" for row in dataset["documents"])


def test_frozen_fifty_document_corpus_is_packaged_and_validated():
    from research_evaluation.corpus import frozen_synthetic_corpus

    payload = frozen_synthetic_corpus()
    assert payload["manifest"]["documents"] == 50
    assert payload["manifest"]["dataset_sha256"] == "c4f1a6228611512fe769206d732ab08dcead5ebf20ebd420bdb2bf782a9be7b1"
    assert [row["id"] for row in payload["documents"]] == [f"SYN-{index:03d}" for index in range(1, 51)]
    assert all(row["source_class"] == "synthetic" for row in payload["documents"])
    assert all("generator_labels" not in row for row in payload["documents"])


def test_comparison_rejects_bad_ids_hashes_and_spans():
    import pytest
    from research_evaluation.lead_demo import demo_dataset
    from research_evaluation.metrics import compare_benchmark
    rows = demo_dataset()["documents"]
    with pytest.raises(ValueError, match="unique"):
        compare_benchmark([rows[0], rows[0]])
    with pytest.raises(ValueError, match="hash mismatch"):
        compare_benchmark([{**rows[0], "content_sha256": "0" * 64}])
    with pytest.raises(ValueError, match="character span"):
        compare_benchmark([{**rows[0], "prediction": {"entities": [_span("DOMAIN", 0, 999999)]}}])


def test_invalid_spans_are_not_silently_dropped_or_rounded():
    import pytest
    for bad in ("not a span", {"type": "DOMAIN", "start": 1.5, "end": 3}, {"type": "DOMAIN", "start": True, "end": 5}):
        with pytest.raises(ValueError, match="character span"):
            evaluate_benchmark([{"gold": {"entities": [bad]}, "prediction": {"entities": []}}])


def test_template_does_not_invent_human_results():
    import asyncio
    from api.routes.evaluation import evaluation_template
    from research_evaluation.metrics import compare_benchmark
    template = asyncio.run(evaluation_template())
    row = template["documents"][0]
    assert row["fabricated_content"] is None
    assert row["pipeline_seconds"] is None
    assert all(not ratings for ratings in row["summary_ratings"].values())
    report = compare_benchmark(template["documents"])
    assert report["overall_status"] != "pass"
