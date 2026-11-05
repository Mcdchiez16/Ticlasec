"""Fail-closed research text preparation. No original values are logged."""
from __future__ import annotations

import hashlib
import hmac
import os
import re

def research_mode() -> bool:
    return (os.getenv("TICLASEC_RESEARCH_MODE", "false") or "false").strip().lower() == "true"


class CollectionDisabled(RuntimeError):
    pass


def require_live_collection() -> None:
    if research_mode():
        raise CollectionDisabled("Live collection is disabled in proposal research mode. Use sanitized archived/synthetic documents. Signed approvals and a verified controlled collector are required before a live study.")


def prepare_text(text: str, secret: bytes, nlp=None) -> tuple[str, dict]:
    """Redact locally, then defang BEFORE hashes, storage, annotation or API.

    Automatic detection is not proof of anonymisation. A named human reviewer
    must check the result before export. A missing PERSON recognizer fails closed.
    """
    if len(secret) < 32:
        raise ValueError("Use a separate random study pseudonymisation key of at least 32 bytes")
    if not 1 <= len(text) <= 30000:
        raise ValueError("Text must contain 1–30000 characters")
    from sanitizer.detectors import _structured_credential_patterns, _PROSE_CREDENTIAL_RES
    from utils.content_safety import is_blocked_query
    blocked, _ = is_blocked_query(text)
    if blocked:
        raise ValueError("Text failed the prohibited-content screen")
    if nlp is None:
        from extractor.ner import get_nlp
        nlp = get_nlp()
    if nlp is None:
        raise ValueError("Personal-name recognizer unavailable; no text released")
    spans = []
    for p in _structured_credential_patterns() + _PROSE_CREDENTIAL_RES:
        spans.extend((m.start(), m.end(), "SECRET") for m in p.finditer(text))
    patterns = {
        "EMAIL": r"\b[A-Za-z0-9._%+-]+(?:@|\[@\])[A-Za-z0-9.-]+(?:\.|\[\.\])[A-Za-z]{2,}\b",
        "NRC": r"\b\d{6}/\d{2}/\d\b",
        "PHONE": r"(?<!\w)(?:\+?260[ -]?)?0?[79]\d(?:[ -]?\d){7}(?!\w)",
        "CARD": r"(?<!\w)(?:\d[ -]?){13,19}(?!\w)",
    }
    for kind, pattern in patterns.items():
        spans.extend((m.start(), m.end(), kind) for m in re.finditer(pattern, text))
    try:
        spans.extend((e.start_char, e.end_char, "PERSON") for e in nlp(text).ents if e.label_ == "PERSON")
    except Exception as exc:
        raise ValueError("Personal-name recognition failed; no text released") from exc
    # Coalesce overlaps so a partial detector never reveals the tail of a secret.
    merged = []
    for start, end, kind in sorted(spans):
        if merged and start < merged[-1][1]:
            previous = merged.pop()
            merged.append((previous[0], max(end, previous[1]), "REDACTED"))
        else:
            merged.append((start, end, kind))
    out, cursor, counts = [], 0, {}
    for start, end, kind in merged:
        token = hmac.new(secret, text[start:end].encode(), hashlib.sha256).hexdigest()[:20]
        marker = f"[{kind}_{token}]"
        if kind == "EMAIL":
            marker = f"person_{token}[@]redacted[.]invalid"
        out.extend([text[cursor:start], marker])
        counts[kind] = counts.get(kind, 0) + 1
        cursor = end
    out.append(text[cursor:])
    sanitized = defang_research_text("".join(out))
    return sanitized, {"redactions": counts, "content_sha256": hashlib.sha256(sanitized.encode()).hexdigest(),
                       "human_review_required": True, "method": "keyed-HMAC-SHA256, regex, spaCy PERSON, defanging"}


def defang_research_text(text: str) -> str:
    """Defang bare domains, email, IPv4/IPv6 and schemes, idempotently."""
    text = re.sub(r"(?i)https?://", lambda m: m[0].lower().replace("http", "hxxp"), text)
    text = re.sub(r"(?i)ftp://", "fxp://", text)
    text = re.sub(r"(?<!\[)@(?!\])", "[@]", text)
    text = re.sub(r"(?<=[\w-])\.(?=[\w-])", "[.]", text)
    text = re.sub(r"\b(?:[0-9a-fA-F]{0,4}:){2,}[0-9a-fA-F]{0,4}\b", lambda m: m[0].replace(":", "[:]"), text)
    return text
