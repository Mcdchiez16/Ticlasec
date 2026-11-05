"""Reproducible 50-document synthetic proof for the evaluation workbench.

This artifact proves that the scoring and deterministic evidence-quality gate
operate on 50 unique synthetic documents.  It is deliberately not presented as
the independently annotated proposal study: it contains no invented human
ratings, manual timings, approvals or adjudication records.
"""
from __future__ import annotations

from copy import deepcopy

from research_evaluation.metrics import compare_benchmark
from utils.lead_quality import LEAD_QUALITY_VERSION, assess_intelligence_lead


def _cases() -> list[tuple[str, str, str, bool, float]]:
    cases: list[tuple[str, str, str, bool, float]] = []

    # Explicit fictional actor claims.  The final item is intentionally below
    # the actor confidence threshold so the report includes a visible FN.
    for index in range(1, 9):
        value = f"Lantern Crew {index:02d}"
        text = (
            f"Synthetic exercise {index:02d}: the fictional threat actor {value} "
            "claimed it breached Example Water in Zambia. This is not a real allegation."
        )
        cases.append((value, "THREAT_ACTOR", text, True, .62 if index == 8 else .91))

    # Names in catalogues are not evidence of a threat actor.
    for index in range(1, 7):
        value = f"Market Brand {index:02d}"
        text = (
            f"Synthetic catalogue {index:02d}: {value} sells books, gift cards, "
            "hosting packages and ordinary marketplace products."
        )
        cases.append((value, "THREAT_ACTOR", text, False, .96))

    # Explicit fictional malware claims.  The final item is intentionally low
    # confidence so recall is not unrealistically perfect.
    for index in range(1, 9):
        value = f"EmberLoader{index:02d}"
        text = (
            f"Synthetic laboratory report {index:02d}: the fictional {value} malware "
            "downloaded a payload and contacted a simulated command and control server."
        )
        cases.append((value, "MALWARE_FAMILY", text, True, .40 if index == 8 else .93))

    # Product and entertainment references are not malware evidence.
    for index in range(1, 7):
        value = f"StoryLoader{index:02d}"
        text = (
            f"Synthetic shop entry {index:02d}: {value} is the title of a fictional "
            "puzzle game sold with posters and books."
        )
        cases.append((value, "MALWARE_FAMILY", text, False, .95))

    # Valid CVE-shaped identifiers are syntax demonstrations only; the text
    # explicitly avoids asserting that the identifiers exist in a registry.
    for index in range(1, 7):
        value = f"CVE-2026-{7100 + index}"
        text = (
            f"Synthetic vulnerability exercise {index:02d}: exploitation of {value} "
            "was claimed in the training scenario. Identifier existence is unverified."
        )
        cases.append((value, "CVE_NUMBER", text, True, .96))

    # Invalid CVE-shaped strings must be rejected by the format gate.
    for index in range(1, 5):
        value = f"CVE-2026-XX{index:02d}"
        text = f"Synthetic comment {index:02d} vaguely mentions {value}, which is not a valid CVE identifier."
        cases.append((value, "CVE_NUMBER", text, False, .96))

    # Documentation-only IP addresses and reserved .example domains are safe
    # synthetic values.  Nearby C2 wording makes their role explicit.
    for index in range(1, 5):
        value = f"192.0.2.{20 + index}"
        text = (
            f"Synthetic network report {index:02d}: fictional malware contacted C2 "
            f"server {value}. The address is reserved for documentation."
        )
        cases.append((value, "IP_ADDRESS", text, True, .94))
    for index in range(1, 5):
        value = f"control-{index:02d}.example"
        text = (
            f"Synthetic network report {index + 4:02d}: a fictional payload used "
            f"{value} as command and control infrastructure in the laboratory exercise."
        )
        cases.append((value, "DOMAIN", text, True, .94))

    # Valid-looking support names without threat context and impossible IP
    # addresses should not become intelligence leads.
    for index in range(1, 3):
        value = f"support-{index:02d}.example"
        text = f"Synthetic business listing {index:02d}: visit {value} for opening hours and customer support."
        cases.append((value, "DOMAIN", text, False, .98))
    for index in range(1, 3):
        value = f"999.999.999.{index}"
        text = f"Synthetic malformed indicator {index:02d}: an alleged C2 address was {value}."
        cases.append((value, "IP_ADDRESS", text, False, .99))

    assert len(cases) == 50
    assert len({text for _, _, text, _, _ in cases}) == 50
    return cases


def synthetic_proof_dataset() -> dict:
    """Return 50 unique synthetic documents and deterministic predictions."""
    documents = []
    for index, (value, kind, text, positive, confidence) in enumerate(_cases(), 1):
        start = text.index(value)
        span = {"type": kind, "start": start, "end": start + len(value), "text": value}
        candidate = {
            "entity_type": kind,
            "value": value,
            "confidence": confidence,
            "context_snippet": text,
        }
        assessment = assess_intelligence_lead(candidate)
        documents.append(
            {
                "id": f"SYN-PROOF-{index:03d}",
                "text": text,
                "source_class": "synthetic",
                "gold": {"entities": [span] if positive else []},
                "baseline_prediction": {"entities": [span]},
                "prediction": {"entities": [span] if assessment["usable"] else []},
                "candidate": candidate,
                "gate_assessment": assessment,
                "human_annotation_status": "not independently annotated",
            }
        )
    return {
        "documents": deepcopy(documents),
        "demo": True,
        "proof_scope": "50 unique developer-authored synthetic documents",
        "baseline_label": "Unfiltered synthetic candidates",
        "improved_label": "Deterministic context and format gate",
        "rule_version": LEAD_QUALITY_VERSION,
        "description": (
            "A reproducible 50-document synthetic proof of scoring and the deterministic "
            "evidence-quality gate. Gold labels are developer-authored. No human annotator "
            "ratings, manual timings, model accuracy, archived data or ethical approvals are "
            "claimed. This is technical demonstration evidence, not the formal research result."
        ),
    }


def run_synthetic_proof() -> dict:
    dataset = synthetic_proof_dataset()
    report = compare_benchmark(dataset["documents"])
    return {
        "dataset": dataset,
        "report": {
            **report,
            "demo": True,
            "overall_status": "demonstration",
            "description": dataset["description"],
        },
    }

