"""Configurable geographic relevance profiles.

The platform is global by default.  A profile adds a *focus*, not a hard
filter: evidence outside the selected geography remains available and is never
silently discarded.  This matters for CTI because infrastructure, actors and
victims routinely cross national borders.

Zambia is the first built-in research profile.  ``custom`` allows the same
engine to target any country, region or organisation group without changing
application code.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any


BUILTIN_SCOPES: dict[str, dict[str, Any]] = {
    "global": {
        "profile_id": "global",
        "label": "Global",
        "description": "Worldwide collection and analysis with no geographic preference.",
        "focus_name": None,
        "keywords": [],
        "patterns": [],
    },
    "zambia": {
        "profile_id": "zambia",
        "label": "Zambia",
        "description": "Prioritises Zambian targets and indicators while retaining global context.",
        "focus_name": "Zambia",
        "keywords": [
            "zambia",
            "zambian",
            "lusaka",
            "copperbelt",
            "ndola",
            "kitwe",
            "livingstone",
            "zicta",
            "zmcirt",
            "zambia cyber security agency",
            "bank of zambia",
            "zanaco",
            "kwacha",
        ],
        "patterns": [
            {"label": ".zm domain", "regex": r"(?i)\b[a-z0-9.-]+\.zm\b", "weight": 24},
            {"label": "+260 phone", "regex": r"(?<!\d)\+?260[\s-]?\d{8,10}\b", "weight": 24},
            {
                "label": "Zambian currency",
                "regex": r"(?i)(?:\bZMW\b|\bK\s?\d[\d,.]*)",
                "weight": 10,
            },
        ],
    },
}


def _clean_terms(values: Iterable[object] | None, *, limit: int = 20) -> list[str]:
    out: list[str] = []
    for raw in values or []:
        value = " ".join(str(raw).strip().split())
        if not value or len(value) > 80:
            continue
        folded = value.casefold()
        if folded not in {item.casefold() for item in out}:
            out.append(value)
        if len(out) >= limit:
            break
    return out


def normalize_scope(scope: Mapping[str, Any] | None) -> dict[str, Any]:
    """Return a safe, serialisable scope definition.

    Unknown profile identifiers fail closed to ``global``.  API validation
    normally prevents that path, but the normaliser also handles durable jobs
    created by older application versions.
    """

    raw = dict(scope or {})
    profile_id = str(raw.get("profile_id") or "global").strip().casefold()
    if profile_id in BUILTIN_SCOPES:
        resolved = dict(BUILTIN_SCOPES[profile_id])
        if profile_id != "global":
            extra = _clean_terms(raw.get("keywords"), limit=10)
            resolved["keywords"] = _clean_terms(
                [*resolved.get("keywords", []), *extra], limit=24
            )
        return resolved

    if profile_id == "custom":
        focus_name = " ".join(str(raw.get("focus_name") or "").strip().split())[:80]
        keywords = _clean_terms(raw.get("keywords"), limit=20)
        if focus_name and focus_name.casefold() not in {k.casefold() for k in keywords}:
            keywords.insert(0, focus_name)
        return {
            "profile_id": "custom",
            "label": focus_name or "Custom focus",
            "description": "User-defined geographic or organisational focus.",
            "focus_name": focus_name or None,
            "keywords": keywords,
            "patterns": [],
        }

    return dict(BUILTIN_SCOPES["global"])


def _contains_term(text: str, term: str) -> bool:
    folded_text = text.casefold()
    folded_term = term.casefold()
    if not folded_term:
        return False
    if re.fullmatch(r"[\w ]+", folded_term):
        return bool(re.search(rf"(?<!\w){re.escape(folded_term)}(?!\w)", folded_text))
    return folded_term in folded_text


def score_text(text: str, scope: Mapping[str, Any] | None) -> dict[str, Any]:
    """Score one evidence block against a geographic scope.

    Scores describe *scope relevance*, not source credibility or truth.
    """

    resolved = normalize_scope(scope)
    if resolved["profile_id"] == "global":
        return {
            "score": 100.0,
            "level": "global",
            "matched_signals": [],
            "rationale": "Global scope does not apply a geographic preference.",
        }

    matches: list[str] = []
    raw_score = 0.0
    for term in resolved.get("keywords", []):
        if _contains_term(text, term):
            matches.append(term)
            raw_score += 12.0 if " " in term else 8.0

    for pattern in resolved.get("patterns", []):
        if re.search(str(pattern["regex"]), text):
            label = str(pattern["label"])
            if label not in matches:
                matches.append(label)
            raw_score += float(pattern.get("weight", 10))

    score = min(100.0, raw_score)
    if score >= 60:
        level = "high"
    elif score >= 30:
        level = "medium"
    elif score > 0:
        level = "low"
    else:
        level = "none"

    focus = resolved.get("focus_name") or resolved.get("label")
    rationale = (
        f"Matched {len(matches)} signal(s) associated with {focus}."
        if matches
        else f"No explicit {focus} signal was found in this evidence block."
    )
    return {
        "score": round(score, 1),
        "level": level,
        "matched_signals": matches[:12],
        "rationale": rationale,
    }


def assess_documents(
    documents: Iterable[str], scope: Mapping[str, Any] | None
) -> dict[str, Any]:
    """Aggregate scope relevance without excluding cross-border evidence."""

    resolved = normalize_scope(scope)
    docs = [str(item or "") for item in documents]
    if resolved["profile_id"] == "global":
        return {
            "profile_id": "global",
            "label": "Global",
            "score": 100.0,
            "level": "global",
            "documents_assessed": len(docs),
            "documents_matched": len(docs),
            "matched_signals": [],
            "rationale": "All collected evidence remains in scope for worldwide analysis.",
        }

    results = [score_text(doc, resolved) for doc in docs if doc.strip()]
    matching = [item for item in results if item["score"] > 0]
    unique_signals: list[str] = []
    for result in matching:
        for signal in result["matched_signals"]:
            if signal not in unique_signals:
                unique_signals.append(signal)

    # The highest-quality local hit should not be diluted by many unrelated
    # global-context pages, while repeated corroboration still increases score.
    peak = max((item["score"] for item in matching), default=0.0)
    corroboration = min(30.0, max(0, len(matching) - 1) * 5.0)
    score = min(100.0, peak + corroboration)
    if score >= 60:
        level = "high"
    elif score >= 30:
        level = "medium"
    elif score > 0:
        level = "low"
    else:
        level = "none"

    focus = resolved.get("focus_name") or resolved["label"]
    return {
        "profile_id": resolved["profile_id"],
        "label": resolved["label"],
        "score": round(score, 1),
        "level": level,
        "documents_assessed": len(results),
        "documents_matched": len(matching),
        "matched_signals": unique_signals[:16],
        "rationale": (
            f"{len(matching)} of {len(results)} evidence documents contain explicit "
            f"signals associated with {focus}. Evidence outside that focus is retained "
            "as cross-border context."
        ),
    }


def scope_search_query(query: str, scope: Mapping[str, Any] | None) -> str:
    """Add the selected focus to a broad query while leaving global unchanged."""

    resolved = normalize_scope(scope)
    focus = resolved.get("focus_name")
    clean_query = " ".join(str(query).split())
    if not focus or _contains_term(clean_query, str(focus)):
        return clean_query
    return f"{clean_query} {focus}"


def scope_prompt_context(scope: Mapping[str, Any] | None) -> str:
    """Instruction text for evidence-grounded summaries."""

    resolved = normalize_scope(scope)
    if resolved["profile_id"] == "global":
        return (
            "Geographic scope: Global. Consider worldwide actors, victims and "
            "infrastructure; do not assume a country connection without evidence."
        )
    return (
        f"Geographic focus: {resolved['label']}. Prioritise explicit connections to "
        "this focus, but retain cross-border context. Clearly distinguish direct "
        "local evidence from possible or unrelated global matches."
    )
