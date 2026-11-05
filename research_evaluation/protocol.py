"""Proposal-specific validation, independent agreement and frozen-gold checks.

This module validates supplied research evidence; it does NOT authenticate a
signature, grant ethics clearance, or certify that human labels are genuine.
The generic evaluator remains available for exploratory work.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from research_evaluation.metrics import _exact_counts, _partial_counts, _prf, evaluate_benchmark

EntityLabel = Literal["IP_ADDRESS", "DOMAIN_URL", "FILE_HASH", "EMAIL", "CRYPTO_WALLET", "MALWARE_TOOL", "THREAT_ACTOR", "CVE_ID", "TARGET_ORG"]
Category = Literal["credential_sale", "malware_ransomware", "fraud_scam", "hacking_service", "data_breach_leak", "not_relevant"]
Relevance = Literal["relevant", "possibly_relevant", "not_relevant"]
ENTITY_LABELS = list(EntityLabel.__args__)
CATEGORIES = list(Category.__args__)
RELEVANCE = list(Relevance.__args__)
PROTOCOL_VERSION = "proposal-2026-10-v1"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False, allow_inf_nan=False)


class Span(StrictModel):
    type: EntityLabel
    start: int = Field(ge=0, strict=True)
    end: int = Field(gt=0, strict=True)
    text: str = Field(min_length=1, max_length=2000)


class Labels(StrictModel):
    entities: list[Span] = Field(max_length=500)
    threat_category: Category
    scope_relevance: Relevance
    summary: str = Field(max_length=2000)

    @model_validator(mode="after")
    def short_summary(self):
        if not 1 <= len(self.summary.split()) <= 80:
            raise ValueError("A summary must contain 1–80 words")
        return self


class Annotation(Labels):
    annotator_id: str = Field(min_length=1, max_length=120)
    active_seconds: float = Field(gt=0, le=86400)
    completed_at: AwareDatetime


class Adjudication(StrictModel):
    supervisor_id: str = Field(min_length=1, max_length=120)
    guide_rule: str = Field(min_length=3, max_length=2000)
    completed_at: AwareDatetime


class Rating(StrictModel):
    rater_id: str = Field(min_length=1, max_length=120)
    accuracy: int = Field(ge=1, le=5, strict=True)
    completeness: int = Field(ge=1, le=5, strict=True)
    actionability: int = Field(ge=1, le=5, strict=True)
    absence_of_hallucination: int = Field(ge=1, le=5, strict=True)
    fabricated_content: bool = Field(strict=True)


class Document(StrictModel):
    id: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    text: str = Field(min_length=1, max_length=30000)
    content_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    split: Literal["practice", "benchmark"]
    source_class: Literal["synthetic", "archived", "approved_live"]
    source_reference: str = Field(min_length=1, max_length=500)
    sanitized_by: str = Field(min_length=1, max_length=120)
    annotations: dict[Literal["B", "C"], Annotation] = Field(default_factory=dict)
    gold: Labels | None = None
    adjudication: Adjudication | None = None
    prediction: Labels | None = None
    pipeline_seconds: float | None = Field(default=None, gt=0, le=86400)
    summary_ratings: list[Rating] = Field(default_factory=list, max_length=3)
    reference_ratings: list[Rating] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def validate_content(self):
        from research_evaluation.safety import defang_research_text
        if defang_research_text(self.text) != self.text:
            raise ValueError("Defang sanitized text before computing hashes or annotations")
        if sha256(self.text) != self.content_sha256:
            raise ValueError("Sanitized text does not match content_sha256")
        if not 50 <= len(self.text.split()) <= 1500:
            raise ValueError("Each study document must contain 50–1500 words")
        for labels in [*self.annotations.values(), self.gold, self.prediction]:
            if labels is None:
                continue
            seen = set()
            for span in labels.entities:
                key = (span.type, span.start, span.end)
                if span.end > len(self.text) or span.end <= span.start or self.text[span.start:span.end] != span.text:
                    raise ValueError("Span must match the exact sanitized Unicode text (end exclusive)")
                if key in seen:
                    raise ValueError("Duplicate entity span")
                seen.add(key)
        return self


class Participants(StrictModel):
    A: str = Field(min_length=1, max_length=120)
    B: str = Field(min_length=1, max_length=120)
    C: str = Field(min_length=1, max_length=120)
    supervisor: str = Field(min_length=1, max_length=120)

    @model_validator(mode="after")
    def distinct(self):
        if len({v.strip().casefold() for v in self.model_dump().values()}) != 4:
            raise ValueError("A, B, C and the supervisor must be four distinct participants")
        return self


class EvidenceReference(StrictModel):
    reference: str = Field(min_length=3, max_length=500)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    reviewed_by: str = Field(min_length=1, max_length=120)
    reviewed_at: AwareDatetime


class Study(StrictModel):
    protocol_version: Literal["proposal-2026-10-v1"] = PROTOCOL_VERSION
    study_id: str = Field(min_length=1, max_length=100)
    scope: Literal["Zambia"] = "Zambia"
    participants: Participants
    documents: list[Document] = Field(max_length=55)
    evidence: dict[str, EvidenceReference] = Field(default_factory=dict, max_length=40)
    training_minutes: int = Field(default=0, ge=0, le=10000)
    frozen_gold_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    frozen_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_participants(self):
        if len({d.id for d in self.documents}) != len(self.documents):
            raise ValueError("Document IDs must be unique")
        if len({d.content_sha256 for d in self.documents}) != len(self.documents):
            raise ValueError("Practice and benchmark texts must be unique and disjoint")
        for doc in self.documents:
            for role, annotation in doc.annotations.items():
                if annotation.annotator_id != getattr(self.participants, role):
                    raise ValueError(f"{doc.id}: inconsistent annotator identity for {role}")
            if doc.adjudication and doc.adjudication.supervisor_id != self.participants.supervisor:
                raise ValueError("Only the separate supervisor may adjudicate")
            for ratings in (doc.summary_ratings, doc.reference_ratings):
                ids = [r.rater_id for r in ratings]
                if len(set(ids)) != len(ids) or not set(ids) <= {self.participants.A, self.participants.B, self.participants.C}:
                    raise ValueError("Summary ratings must come from distinct A, B and C identities")
        return self


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def canonical_hash(value) -> str:
    return sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")))


def gold_hash(study: Study) -> str:
    return canonical_hash([{"id": d.id, "content_sha256": d.content_sha256, "gold": d.gold.model_dump() if d.gold else None}
                           for d in sorted(study.documents, key=lambda x: x.id) if d.split == "benchmark"])


def cohen_kappa(left: list[str], right: list[str]) -> dict:
    if len(left) != len(right):
        raise ValueError("Agreement requires paired annotations")
    if not left:
        return {"pairs": 0, "observed_agreement": None, "kappa": None}
    n = len(left)
    observed = sum(a == b for a, b in zip(left, right)) / n
    a, b = Counter(left), Counter(right)
    expected = sum(a[k] * b[k] for k in a.keys() | b.keys()) / (n * n)
    # A single identical label makes the denominator zero, not a perfect kappa.
    return {"pairs": n, "observed_agreement": round(observed, 6),
            "kappa": round((observed - expected) / (1 - expected), 6) if expected < 1 else None}


def agreement(documents: list[Document]) -> dict:
    paired = [d for d in documents if set(d.annotations) == {"B", "C"}]
    output = {field: cohen_kappa([getattr(d.annotations["B"], field) for d in paired],
                               [getattr(d.annotations["C"], field) for d in paired])
              for field in ("threat_category", "scope_relevance")}
    for mode, count in (("exact", _exact_counts), ("partial", _partial_counts)):
        totals = [0, 0, 0]
        for d in paired:
            counts = count([s.model_dump() for s in d.annotations["B"].entities],
                           [s.model_dump() for s in d.annotations["C"].entities])
            totals = [a + b for a, b in zip(totals, counts)]
        output[f"span_{mode}"] = _prf(tuple(totals)) if paired else None
    return {"paired_documents": len(paired), "expected_documents": len(documents), **output}


REQUIRED_EVIDENCE = {
    "ethics_clearance": "Written university ethics clearance, including human participants and provider transfer",
    "supervisor_protocol": "Supervisor-signed collection and annotation protocol",
    "annotator_consent": "B/C consent, confidentiality and eligibility records",
    "label_studio_access": "Lab-LAN Label Studio, separate blinded projects, restricted B/C accounts and access expiry",
    "summary_blinding": "Randomized source-blind reference/model summary assignments for A/B/C",
    "model_access": "Redacted account test: endpoint, requested/returned model, SDK, date and status",
    "methodology_approval": "Supervisor decision on current hybrid extraction vs proposed neural CTI NER",
    "encrypted_vm": "Encrypted isolated VM, external keys, firewall, no shared folders and snapshot procedure",
    "mfa": "Verified MFA on researcher and supervisor accounts",
    "backup_restore": "Nightly encrypted external-drive/cloud backups and a measured restore test",
    "retention": "Approved schedule and raw-data deletion plan within 30 days of final examination",
    "run_manifest": "Versioned baseline and final runs, failures, tokens, runtime and verified pricing",
}


def audit_study(study: Study) -> dict:
    practice = [d for d in study.documents if d.split == "practice"]
    benchmark = [d for d in study.documents if d.split == "benchmark"]
    composition = Counter(d.source_class for d in benchmark)
    practice_agreement = agreement(practice)
    kappa = practice_agreement["threat_category"]["kappa"]
    checks = []
    def add(key, ok, detail):
        checks.append({"id": key, "status": "met" if ok else "missing", "detail": detail})
    add("corpus", len(benchmark) == 50 and composition in [Counter(synthetic=20, archived=30), Counter(synthetic=20, archived=20, approved_live=10)],
        "50 unique benchmark documents: 20 synthetic + 30 archived, or 20 synthetic + 20 archived + 10 approved live.")
    add("practice", len(practice) == 5 and practice_agreement["paired_documents"] == 5 and kappa is not None and kappa >= .70 and study.training_minutes >= 60,
        "Five separate practice documents, ≥60 minutes training and B/C category kappa ≥0.70 (undefined kappa does not pass).")
    add("independent_annotations", len(benchmark) == 50 and all(set(d.annotations) == {"B", "C"} for d in benchmark),
        "Complete B/C pre-adjudication labels, summaries and independently measured active times.")
    practice_times = [a.completed_at for d in practice for a in d.annotations.values()]
    main_times = [a.completed_at for d in benchmark for a in d.annotations.values()]
    add("training_before_benchmark", len(practice_times) == 10 and len(main_times) == 100 and max(practice_times) < min(main_times),
        "Complete both practice annotations before beginning independent benchmark annotation; timestamp records must support this order.")
    add("adjudication", len(benchmark) == 50 and all(set(d.annotations) == {"B", "C"} and d.gold and d.adjudication and all(a.completed_at <= d.adjudication.completed_at for a in d.annotations.values()) for d in benchmark),
        "Supervisor decisions with annotation-guide rules and checked A reference summaries after independent annotation.")
    digest = gold_hash(study)
    add("frozen_gold", bool(len(benchmark) == 50 and study.frozen_at and study.frozen_gold_sha256 == digest and all(d.adjudication and d.adjudication.completed_at <= study.frozen_at for d in benchmark)),
        "Frozen gold hash matches exactly; no relabelling after inspecting automated results.")
    add("ratings", len(benchmark) == 50 and all(len(d.summary_ratings) == len(d.reference_ratings) == 3 for d in benchmark),
        "A/B/C each rate both blinded model and reference summaries on all four criteria, including fabrication flags.")
    for key, detail in REQUIRED_EVIDENCE.items():
        evidence = study.evidence.get(key)
        add(key, bool(evidence and evidence.reviewed_by == study.participants.supervisor and evidence.reviewed_at <= datetime.now(timezone.utc)), detail + " Evidence is a supplied reference, not independently authenticated approval.")
    if composition["approved_live"]:
        add("live_sources", "five_source_approvals" in study.evidence,
            "Individually approved ≥5 Zambia-relevant public sources, weekly 200/source caps, daily throttle, stop-on-error and no discovered-link traversal.")
    else:
        checks.append({"id": "live_sources", "status": "deferred", "detail": "Archived-data fallback selected. Objective 1 live five-source demonstration remains deferred, not fulfilled by archived documents."})
    rows = []
    for d in benchmark:
        ratings = d.summary_ratings
        rows.append({"id": d.id, "text": d.text, "gold": d.gold.model_dump() if d.gold else {},
                     "prediction": d.prediction.model_dump() if d.prediction else {},
                     "manual_entities": [[s.model_dump() for s in d.annotations[r].entities] for r in ("B", "C") if r in d.annotations],
                     "manual_seconds": [d.annotations[r].active_seconds for r in ("B", "C") if r in d.annotations],
                     "pipeline_seconds": d.pipeline_seconds,
                     "summary_ratings": {k: [getattr(r, k) for r in ratings] for k in ("accuracy", "completeness", "actionability", "absence_of_hallucination")},
                     "fabricated_content": any(r.fabricated_content for r in ratings) if len(ratings) == 3 else None})
    metrics = evaluate_benchmark(rows)
    # Generic scorer allows exploratory incomplete records; formal protocol does not.
    add("measured_predictions", len(benchmark) == 50 and all(d.prediction and d.pipeline_seconds for d in benchmark), "A measured model prediction and wall-clock duration for every benchmark document.")
    add("performance", metrics["overall_status"] == "pass", "All pre-registered proposal thresholds must pass; shortfalls must be reported, not hidden.")
    return {"protocol_version": PROTOCOL_VERSION, "study_id": study.study_id,
            "status": "evidence_complete_requires_supervisor_review" if all(c["status"] == "met" for c in checks) else "not_submission_ready",
            "checked_at": datetime.now(timezone.utc).isoformat(), "gold_sha256": digest,
            "composition": dict(composition), "checks": checks, "practice_agreement": practice_agreement,
            "benchmark_agreement": agreement(benchmark), "metrics": metrics,
            "notice": "This validates supplied records, not signature authenticity, participant independence, infrastructure security or legal compliance. A supervisor must review the evidence. No approval is granted by this report."}


def empty_study() -> dict:
    return Study(study_id="zambia-pilot-01", participants=Participants(A="researcher-A", B="annotator-B", C="annotator-C", supervisor="supervisor"), documents=[]).model_dump(mode="json")
