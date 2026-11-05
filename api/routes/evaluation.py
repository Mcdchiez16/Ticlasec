"""Authenticated research-evaluation workbench endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from research_evaluation import DEFAULT_THRESHOLDS, evaluate_benchmark
from research_evaluation.metrics import compare_benchmark
from research_evaluation.protocol import Study, audit_study, empty_study, REQUIRED_EVIDENCE, ENTITY_LABELS, CATEGORIES, RELEVANCE


router = APIRouter(prefix="/evaluation", tags=["evaluation"])


class EvaluationRequest(BaseModel):
    documents: list[dict[str, Any]] = Field(min_length=1, max_length=500)
    thresholds: dict[str, float | int] | None = None
    demo: bool = False


@router.get("/template")
async def evaluation_template() -> dict:
    return {
        "instructions": "Replace this example with your annotated documents and measured predictions. Leave human ratings and timings empty until actually measured. Baseline and improved predictions use exactly the same text and gold labels.",
        "thresholds": DEFAULT_THRESHOLDS,
        "documents": [
            {
                "id": "DOC-001",
                "text": "Example document: replace with sanitized evidence.",
                "source_class": "template",
                "gold": {
                    "entities": [],
                    "threat_category": "",
                    "scope_relevance": "",
                },
                "baseline_prediction": {"entities": [], "threat_category": "", "scope_relevance": ""},
                "prediction": {
                    "entities": [],
                    "threat_category": "",
                    "scope_relevance": "",
                },
                "summary_ratings": {
                    "accuracy": [],
                    "completeness": [],
                    "actionability": [],
                    "absence_of_hallucination": [],
                },
                "fabricated_content": None,
                "manual_entities": [],
                "manual_seconds": [],
                "baseline_seconds": None,
                "pipeline_seconds": None,
            }
        ],
    }


@router.post("/score")
async def score_evaluation(body: EvaluationRequest) -> dict:
    try:
        if any("baseline_prediction" in row for row in body.documents):
            report = compare_benchmark(body.documents, body.thresholds)
        else:
            report = evaluate_benchmark(body.documents, body.thresholds)
        if body.demo:
            report.update(demo=True, overall_status="demonstration")
        return report
    except (TypeError, ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid benchmark data: {exc}")


@router.get("/lead-demo")
def evidence_quality_demo():
    from research_evaluation.lead_demo import run_demo
    return run_demo()


@router.get("/synthetic-proof")
def fifty_document_synthetic_proof():
    from research_evaluation.synthetic_proof import run_synthetic_proof
    return run_synthetic_proof()


@router.get("/synthetic-corpus")
def fifty_document_synthetic_corpus():
    """Return the frozen public corpus without private generator labels."""
    from research_evaluation.corpus import frozen_synthetic_corpus
    return frozen_synthetic_corpus()


@router.get("/proposal")
def proposal_requirements():
    from research_evaluation.safety import research_mode
    from research_evaluation.annotation import label_config
    return {"research_mode": research_mode(), "scope": "Zambia", "template": empty_study(),
            "entity_labels": ENTITY_LABELS, "categories": CATEGORIES, "relevance": RELEVANCE,
            "required_evidence": REQUIRED_EVIDENCE, "label_studio_config": label_config(),
            "notice": "No signed approvals, human results or infrastructure verification are supplied automatically. Do not upload raw or unredacted source material."}


@router.post("/proposal/audit")
def audit_proposal(body: Study):
    return audit_study(body)
