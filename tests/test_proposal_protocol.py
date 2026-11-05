"""Proposal workflow tests use invented fixtures, never measured study results."""
from copy import deepcopy
from datetime import datetime, timezone
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from research_evaluation.protocol import Study, Document, Labels, audit_study, empty_study, sha256, cohen_kappa, gold_hash
from research_evaluation.annotation import annotation_tasks, import_annotations, blinded_summary_pack, _unicode_offset
from research_evaluation.runner import validate_prediction, predict_document, run_study
from research_evaluation.safety import prepare_text, defang_research_text, require_live_collection, CollectionDisabled
from research_evaluation.study_cli import main, write_new


def document(index=0, split="benchmark"):
    text = f"Test document {index}: " + " ".join(["synthetic"] * 50) + " Example Crew used test[.]invalid in Zambia."
    return {"id": f"DOC-{index}", "text": text, "content_sha256": sha256(text), "split": split,
            "source_class": "synthetic", "source_reference": "invented test fixture", "sanitized_by": "researcher-A"}


def labels():
    return {"entities": [], "threat_category": "not_relevant", "scope_relevance": "possibly_relevant", "summary": "Synthetic exercise with no verified real incident."}


def annotation(role="B"):
    return {**labels(), "annotator_id": f"annotator-{role}", "active_seconds": 90, "completed_at": "2026-10-20T10:00:00Z"}


def study_data():
    return {**empty_study(), "documents": [document()]}


def test_empty_study_never_passes():
    report = audit_study(Study.model_validate(empty_study()))
    assert report["status"] == "not_submission_ready"
    assert not any(c["status"] == "met" for c in report["checks"])
    assert report["practice_agreement"]["threat_category"]["kappa"] is None


@pytest.mark.parametrize("change", [
    lambda d: d.update(content_sha256="0" * 64),
    lambda d: d.update(text="short", content_sha256=sha256("short")),
    lambda d: d.update(gold={**labels(), "threat_category": "other"}),
    lambda d: d.update(gold={**labels(), "entities": [{"type": "EMAIL", "start": 0, "end": 4, "text": "wrong"}]}),
    lambda d: d.update(gold={**labels(), "entities": [{"type": "IP_ADDRESS", "start": True, "end": 4, "text": "Test"}]}),
    lambda d: d.update(gold={**labels(), "summary": "word " * 81}),
    lambda d: d.update(annotations={"B": {**annotation(), "active_seconds": float("nan")}}),
    lambda d: d.update(annotations={"B": {**annotation(), "annotator_id": "annotator-C"}}),
])
def test_invalid_study_data_is_rejected(change):
    data = study_data(); change(data["documents"][0])
    with pytest.raises(ValidationError):
        Study.model_validate(data)


def test_distinct_roles_disjoint_practice_and_raters():
    data = study_data(); data["participants"]["supervisor"] = "annotator-B"
    with pytest.raises(ValidationError): Study.model_validate(data)
    data = study_data(); second = deepcopy(data["documents"][0]); second.update(id="DOC-2", split="practice"); data["documents"].append(second)
    with pytest.raises(ValidationError): Study.model_validate(data)


def test_kappa_known_case_and_undefined_case():
    assert cohen_kappa(["a", "a", "b", "b"], ["a", "b", "b", "b"])["kappa"] == .5
    assert cohen_kappa(["a"] * 5, ["a"] * 5)["kappa"] is None
    assert cohen_kappa([], [])["kappa"] is None
    with pytest.raises(ValueError): cohen_kappa(["a"], [])


def test_blinded_export_contains_only_text_and_identity():
    data = study_data(); doc = data["documents"][0]
    doc.update(gold=labels(), prediction=labels(), annotations={"B": annotation()})
    tasks = annotation_tasks(Study.model_validate(data), "benchmark")
    assert set(tasks[0]) == {"data"}
    assert set(tasks[0]["data"]) == {"document_id", "content_sha256", "text"}


def test_label_studio_import_checks_identity_hash_and_no_overwrite():
    study = Study.model_validate(study_data()); doc = study.documents[0]
    results = [
        {"from_name": "threat_category", "value": {"choices": ["not_relevant"]}},
        {"from_name": "scope_relevance", "value": {"choices": ["possibly_relevant"]}},
        {"from_name": "summary", "value": {"text": ["A synthetic exercise."]}},
        {"from_name": "active_seconds", "value": {"text": ["89.5"]}},
    ]
    task = {**annotation_tasks(study, "benchmark")[0], "annotations": [{"completed_by": 11, "updated_at": "2026-10-20T10:00:00Z", "result": results}]}
    changed = import_annotations(study, [task], "B", "11")
    assert changed.documents[0].annotations["B"].active_seconds == 89.5
    assert not study.documents[0].annotations
    with pytest.raises(ValueError): import_annotations(changed, [task], "B", "11")
    with pytest.raises(ValueError): import_annotations(study, [task], "C", "12")
    task["data"]["text"] += " edited"
    with pytest.raises(ValueError): import_annotations(study, [task], "B", "11")
    assert _unicode_offset("a😀b", 3) == 2
    with pytest.raises(ValueError): _unicode_offset("a😀b", 2)


def test_gold_hash_cannot_hide_changed_labels():
    study = Study.model_validate(study_data()); study.documents[0].gold = Labels.model_validate(labels())
    digest = gold_hash(study)
    study.documents[0].gold.summary = "Changed reference summary."
    assert gold_hash(study) != digest


def test_blind_summary_keys_separated():
    study = Study.model_validate(study_data()); study.documents[0].gold = Labels.model_validate(labels()); study.documents[0].prediction = Labels.model_validate(labels())
    study.frozen_gold_sha256 = gold_hash(study)
    pack = blinded_summary_pack(study)
    assert len(pack["supervisor_only_key"]) == 6
    for packet in pack["rater_packets"].values():
        assert len(packet) == 2
        assert all("kind" not in item and "model" not in item for item in packet)


def test_sanitizer_is_stable_and_fails_closed():
    fake_nlp = lambda text: SimpleNamespace(ents=[])
    text = "Contact person@example.com or +260971234567. NRC 123456/12/1. Password: secretvalue and URL https://test.example/path IP 192.0.2.1"
    sanitized, result = prepare_text(text, b"x" * 32, nlp=fake_nlp)
    assert not any(raw in sanitized for raw in ["person@example", "971234567", "123456/12/1", "secretvalue", "https://", "test.example", "192.0.2.1"])
    assert sanitized == prepare_text(text, b"x" * 32, nlp=fake_nlp)[0]
    assert sanitized != prepare_text(text, b"y" * 32, nlp=fake_nlp)[0]
    assert defang_research_text(sanitized) == sanitized
    assert result["human_review_required"]
    with pytest.raises(ValueError): prepare_text(text, b"x", nlp=fake_nlp)
    def broken(_): raise RuntimeError("internal")
    with pytest.raises(ValueError): prepare_text(text, b"x" * 32, nlp=broken)


@pytest.mark.parametrize("change", [
    lambda r: r.update(tools=["execute"]),
    lambda r: r.update(threat_category="ignore schema"),
    lambda r: r.update(supporting_quotes=["invented quotation"]),
    lambda r: r.update(summary="Visit https://evil.example now"),
    lambda r: r.update(entities=[{"type": "THREAT_ACTOR", "start": 0, "end": 4, "text": "fake"}]),
])
def test_invalid_or_injected_model_output_is_rejected(change):
    raw = {**labels(), "supporting_quotes": ["Test document"]}; change(raw)
    with pytest.raises(ValueError): validate_prediction(document()["text"], json.dumps(raw))


@pytest.mark.asyncio
async def test_runner_no_tools_storage_false_and_failure_manifest():
    raw = {**labels(), "supporting_quotes": ["Test document"]}
    response = SimpleNamespace(model="pinned-snapshot", _request_id="request-1", usage=SimpleNamespace(prompt_tokens=20, completion_tokens=10), choices=[SimpleNamespace(finish_reason="stop", message=SimpleNamespace(content=json.dumps(raw), tool_calls=None, refusal=None))])
    call = AsyncMock(return_value=response)
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=call)))
    result = await predict_document(client, "requested", Document.model_validate(document()), "https://api.openai.com/v1")
    assert result["manifest"]["status"] == "completed"
    assert result["manifest"]["returned_model"] == "pinned-snapshot"
    kwargs = call.call_args.kwargs
    assert kwargs["store"] is False and "tools" not in kwargs
    assert kwargs["response_format"]["json_schema"]["strict"]
    assert len(kwargs["messages"]) == 2 and "UNTRUSTED_DOCUMENT_JSON" in kwargs["messages"][1]["content"]
    call.side_effect = RuntimeError("DO-NOT-LEAK-SECRET")
    failure = await predict_document(client, "requested", Document.model_validate(document()), "https://api.openai.com/v1")
    assert failure["prediction"] is None and "DO-NOT-LEAK" not in json.dumps(failure)
    assert failure["manifest"]["retries"] == 0


@pytest.mark.asyncio
async def test_runner_refuses_unfrozen_study_before_api_call():
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=AsyncMock())))
    with pytest.raises(ValueError): await run_study(client, "test", Study.model_validate(study_data()), "https://api.openai.com/v1")
    client.chat.completions.create.assert_not_called()


def test_cli_never_overwrites_and_restore_check(tmp_path):
    from cryptography.fernet import Fernet
    key_path, study_path, out = tmp_path / "key", tmp_path / "study.enc", tmp_path / "check.json"
    key = Fernet.generate_key(); key_path.write_bytes(key)
    study_path.write_bytes(Fernet(key).encrypt(json.dumps(empty_study()).encode()))
    assert main(["restore-check", "--input", str(study_path), "--key-file", str(key_path), "--output", str(out)]) == 0
    assert json.loads(out.read_text())["decryption"] == "passed"
    with pytest.raises(FileExistsError): write_new(str(out), b"changed")
    assert "decryption" in out.read_text()


def test_cli_exports_one_rater_without_allocation_key(tmp_path):
    from cryptography.fernet import Fernet
    key = Fernet.generate_key(); key_path = tmp_path / "key"; key_path.write_bytes(key)
    allocation = {"rater_packets": {"A": [{"blind_id": "a", "summary": "Anonymous summary"}], "B": [{"blind_id": "b"}]}, "supervisor_only_key": {"a": "reference"}}
    source = tmp_path / "allocation.enc"; source.write_bytes(Fernet(key).encrypt(json.dumps(allocation).encode()))
    output = tmp_path / "rater.json"
    assert main(["export-rater", "--input", str(source), "--key-file", str(key_path), "--rater", "A", "--output", str(output)]) == 0
    assert json.loads(output.read_text()) == allocation["rater_packets"]["A"]
    assert "reference" not in output.read_text()


def test_research_mode_refuses_live_actions(monkeypatch):
    from api.research_guard import request_allowed
    monkeypatch.setenv("TICLASEC_RESEARCH_MODE", "true")
    with pytest.raises(CollectionDisabled): require_live_collection()
    assert request_allowed("POST", "/evaluation/proposal/audit")
    assert request_allowed("GET", "/investigations/abc")
    for method, path in [("POST", "/investigations"), ("POST", "/monitors/1/run"), ("GET", "/debug/search-test"), ("GET", "/search"), ("POST", "/investigations/1/briefing")]:
        assert not request_allowed(method, path)


@pytest.mark.parametrize("setting", [None, "false"])
def test_normal_product_mode_enables_collection_and_workers(monkeypatch, setting):
    from research_evaluation.safety import research_mode
    from api.main import _worker_disabled
    if setting is None:
        monkeypatch.delenv("TICLASEC_RESEARCH_MODE", raising=False)
    else:
        monkeypatch.setenv("TICLASEC_RESEARCH_MODE", setting)
    monkeypatch.delenv("TICLASEC_DISABLE_QUEUE_WORKER", raising=False)
    assert research_mode() is False
    require_live_collection()
    assert _worker_disabled() is False


@pytest.mark.asyncio
async def test_normal_mode_passes_investigations_through_guard(monkeypatch):
    from api.research_guard import research_guard
    from starlette.requests import Request
    from starlette.responses import JSONResponse
    request = Request({"type": "http", "method": "POST", "path": "/investigations", "headers": []})
    handler = AsyncMock(return_value=JSONResponse({"status": "accepted"}, status_code=202))
    monkeypatch.setenv("TICLASEC_RESEARCH_MODE", "false")
    response = await research_guard(request, handler)
    assert response.status_code == 202
    handler.assert_awaited_once_with(request)
    handler.reset_mock()
    monkeypatch.setenv("TICLASEC_RESEARCH_MODE", "true")
    response = await research_guard(request, handler)
    assert response.status_code == 423
    handler.assert_not_awaited()
