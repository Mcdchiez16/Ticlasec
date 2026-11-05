"""Evidence-quality checks for analyst-facing intelligence leads.

Extraction confidence answers "did the parser recognise this text?".  It does
not answer "does the surrounding source actually support this threat claim?".
This module keeps those concepts separate and provides a deterministic quality
gate shared by the API briefing and summary inputs.
"""

from __future__ import annotations

import ipaddress
import math
import re
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlparse


ACTOR_TYPES = frozenset({"THREAT_ACTOR", "THREAT_ACTOR_HANDLE", "RANSOMWARE_GROUP"})
MALWARE_TYPES = frozenset({"MALWARE", "MALWARE_FAMILY"})
STRUCTURED_TYPES = frozenset({
    "CVE", "CVE_NUMBER", "IP_ADDRESS", "DOMAIN", "C2_SERVER", "ONION_URL", "PASTE_URL",
})

_ACTOR_ROLE_RE = re.compile(
    r"\b(?:ransomware\s+(?:group|gang|operator|operation)|threat\s+actor|"
    r"(?:group|gang|affiliate|operator)\s+(?:claimed|targeted|attacked|breached)|"
    r"leak\s+site|victim\s+(?:claim|listing|post))\b",
    re.IGNORECASE,
)
_MALWARE_ROLE_RE = re.compile(
    r"\b(?:malware|ransomware|raas|remote\s+access\s+trojan|rat|trojan|"
    r"stealer|loader|backdoor|payload|botnet|command\s+and\s+control|c2)\b",
    re.IGNORECASE,
)
_EVENT_RE = re.compile(
    r"\b(?:claimed|targeted|attacked|breached|compromised|encrypted|exfiltrat\w*|"
    r"leaked|published|listed\s+(?:a|the)\s+victim|initial\s+access)\b",
    re.IGNORECASE,
)
_INFRA_CONTEXT_RE = re.compile(
    r"\b(?:indicator|ioc|infrastructure|command\s+and\s+control|c2|callback|"
    r"beacon(?:ed|ing)?|contact(?:ed|ing)?|resolv(?:e|es|ed|ing)|host(?:ed|ing)|"
    r"payload|phishing|malware|ransomware|threat\s+actor|exploit(?:ed|ing)?)\b",
    re.IGNORECASE,
)
_CVE_RE = re.compile(r"^CVE-\d{4}-\d{4,7}$", re.IGNORECASE)
_HOST_RE = re.compile(
    r"^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$",
    re.IGNORECASE,
)
_AMBIGUOUS_SINGLE_WORDS = frozenset({
    "android", "play", "magic", "cloud", "data", "server", "support", "admin",
    "user", "unknown", "test", "group", "ransomware", "malware", "windows", "linux",
})


def _value(item: Any, key: str, default: Any = None) -> Any:
    if isinstance(item, Mapping):
        return item.get(key, default)
    return getattr(item, key, default)


def _number(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
        return number if math.isfinite(number) else default
    except (TypeError, ValueError):
        return default


def _compact(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def evidence_excerpt(context: str, value: str, *, max_chars: int = 360) -> str:
    """Return a bounded excerpt centred on the extracted value."""
    text = _compact(context)
    if not text:
        return ""
    position = text.casefold().find(value.casefold()) if value else -1
    if position < 0:
        return text[:max_chars] + ("…" if len(text) > max_chars else "")
    start = max(0, position - max_chars // 2)
    end = min(len(text), start + max_chars)
    if end - start < max_chars:
        start = max(0, end - max_chars)
    excerpt = text[start:end]
    return ("…" if start else "") + excerpt + ("…" if end < len(text) else "")


def _local_window(context: str, value: str, radius: int = 170) -> str:
    text = _compact(context)
    if not text:
        return ""
    position = text.casefold().find(value.casefold()) if value else -1
    if position < 0:
        return text[: radius * 2]
    return text[max(0, position - radius): position + len(value) + radius]


def _looks_like_directory(context: str) -> bool:
    lowered = context.casefold()
    return (
        context.count("|") >= 12
        or lowered.count(".onion") >= 4
        or lowered.count("add your link") >= 2
        or sum(lowered.count(term) for term in (
            "gift card", "drugs", "carding", "counterfeit", "marketplace", "products",
        )) >= 5
    )


def _structured_value_valid(entity_type: str, value: str) -> bool:
    raw = value.strip().replace("[.]", ".")
    if entity_type in {"CVE", "CVE_NUMBER"}:
        return bool(_CVE_RE.fullmatch(raw))
    if entity_type in {"IP_ADDRESS", "C2_SERVER"}:
        try:
            ipaddress.ip_address(raw)
            return True
        except ValueError:
            return entity_type == "C2_SERVER" and bool(_HOST_RE.fullmatch(raw))
    if entity_type == "DOMAIN":
        return bool(_HOST_RE.fullmatch(raw))
    if entity_type == "ONION_URL":
        host = urlparse(raw if "://" in raw else f"http://{raw}").hostname or ""
        return host.casefold().endswith(".onion") and len(host.split(".")[0]) >= 16
    if entity_type == "PASTE_URL":
        parsed = urlparse(raw)
        return parsed.scheme in {"http", "https"} and bool(parsed.hostname)
    return True


def _assess_intelligence_lead(item: Any) -> dict[str, Any]:
    """Classify one extraction for analyst display without mutating it."""
    entity_type = str(_value(item, "entity_type", "") or "").upper()
    value = _compact(_value(item, "value", ""))
    context = _compact(
        _value(item, "context_snippet") or _value(item, "context") or ""
    )
    confidence = max(0.0, min(1.0, _number(_value(item, "confidence"))))
    excerpt = evidence_excerpt(context, value)

    if not value:
        return {
            "usable": False, "status": "rejected", "score": 0.0,
            "reason": "The extraction has no value.", "evidence_excerpt": "",
        }

    # Neither a parser's source count nor a graph edge proves independent
    # confirmation. Analyst decisions are recorded separately with evidence.
    directory_noise = _looks_like_directory(context)
    local = _local_window(context, value)

    if not re.search(
        r"(?<!\w)" + re.escape(value) + r"(?!\w)", context, re.IGNORECASE
    ):
        return {
            "usable": False, "status": "rejected", "score": 0.0,
            "reason": "The extracted value does not appear in the supplied source context.",
            "evidence_excerpt": excerpt,
        }

    if entity_type in STRUCTURED_TYPES:
        if not _structured_value_valid(entity_type, value):
            return {
                "usable": False, "status": "rejected", "score": round(confidence * 0.25, 3),
                "reason": "The value does not match the expected indicator format.",
                "evidence_excerpt": excerpt,
            }
        # A syntactically valid address is not automatically threat
        # infrastructure. In particular, link directories contain many valid
        # domains/onion URLs that only describe where a page lives. Keep those
        # in the scraped-links view unless the nearby text states a security role.
        if entity_type not in {"CVE", "CVE_NUMBER"}:
            role_supported = bool(_INFRA_CONTEXT_RE.search(local))
            if not role_supported:
                return {
                    "usable": False, "status": "rejected", "score": round(confidence * 0.3, 3),
                    "reason": "The address is valid, but the nearby text does not identify it as threat infrastructure.",
                    "evidence_excerpt": excerpt,
                }
            if directory_noise and not _EVENT_RE.search(local):
                return {
                    "usable": False, "status": "rejected", "score": round(confidence * 0.3, 3),
                    "reason": "The address appears in directory or marketplace text without a supported threat relationship.",
                    "evidence_excerpt": excerpt,
                }
        score = min(1.0, confidence * 0.65 + 0.08 + (0.15 if context else 0.05))
        return {
            "usable": confidence >= 0.6,
            "status": "format_validated",
            "score": round(score, 3),
            "reason": "The indicator format is valid, but the source claim still needs independent validation.",
            "evidence_excerpt": excerpt,
        }

    if entity_type in ACTOR_TYPES:
        role_supported = bool(_ACTOR_ROLE_RE.search(local))
        event_supported = bool(_EVENT_RE.search(local))
        ambiguous = value.casefold() in _AMBIGUOUS_SINGLE_WORDS
        if not role_supported or (directory_noise and not event_supported) or (ambiguous and not event_supported):
            return {
                "usable": False, "status": "rejected", "score": round(confidence * 0.2, 3),
                "reason": "The nearby text does not identify this value as a threat actor or ransomware group.",
                "evidence_excerpt": excerpt,
            }
        score = min(1.0, confidence * 0.55 + 0.30)
        return {
            "usable": confidence >= 0.7,
            "status": "single_source",
            "score": round(score, 3),
            "reason": "The actor role is explicit, but this remains a single-source lead.",
            "evidence_excerpt": excerpt,
        }

    if entity_type in MALWARE_TYPES:
        role_supported = bool(_MALWARE_ROLE_RE.search(local))
        if not role_supported or (directory_noise and not _EVENT_RE.search(local) and "raas" not in local.casefold()):
            return {
                "usable": False, "status": "rejected", "score": round(confidence * 0.25, 3),
                "reason": "The nearby text does not clearly describe this value as malware or a threat tool.",
                "evidence_excerpt": excerpt,
            }
        score = min(1.0, confidence * 0.6 + 0.30)
        return {
            "usable": confidence >= 0.65,
            "status": "single_source",
            "score": round(score, 3),
            "reason": "The source explicitly describes malware, but independent corroboration is still required.",
            "evidence_excerpt": excerpt,
        }

    # Other summary entities are kept only when they have both strong extraction
    # confidence and readable local context. They are not promoted as priority
    # leads solely because the parser assigned a high score.
    usable = confidence >= 0.8 and bool(context) and not directory_noise
    return {
        "usable": usable,
        "status": "single_source" if usable else "rejected",
        "score": round(confidence * (0.8 if usable else 0.25), 3),
        "reason": (
            "The extraction has readable supporting context."
            if usable
            else "The extraction lacks sufficiently specific supporting context."
        ),
        "evidence_excerpt": excerpt,
    }


LEAD_QUALITY_VERSION = "2.0"


def assess_intelligence_lead(item: Any) -> dict[str, Any]:
    result = _assess_intelligence_lead(item)
    if not result["usable"]:
        if result["status"] != "rejected":
            result["reason"] = "Withheld because extraction confidence is below the rule threshold. " + result["reason"]
        result["status"] = "rejected"
    return {
        **result,
        "score_kind": "heuristic",
        "score_explanation": "Rule-based ranking score, not a probability that a threat claim is true.",
        "rule_version": LEAD_QUALITY_VERSION,
    }


def filter_usable_leads(items: list[Any]) -> list[Any]:
    """Return only analyst-usable leads while preserving caller order."""
    return [item for item in items if assess_intelligence_lead(item)["usable"]]
