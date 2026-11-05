"""Trace entity mentions to case-owned passages; never infer independence."""
from __future__ import annotations

import hashlib
import json
import re
from difflib import SequenceMatcher
from urllib.parse import urlparse

from utils.lead_quality import assess_intelligence_lead, evidence_excerpt


def content_digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _normal(text: str) -> str:
    return re.sub(r"\W+", " ", text.casefold()).strip()


def entity_evidence(entity: dict, pages: list[dict]) -> dict:
    """Only caller-scoped pages may be supplied. Copies never add support."""
    value = str(entity.get("value") or "").strip()
    if not value:
        return {"sources": [], "mention_count": 0, "distinct_origins": 0,
                "unique_passages": 0, "duplicate_count": 0, "fingerprint": content_digest(""),
                "independence": "No source passages available."}
    pattern = re.compile(r"(?<!\w)" + re.escape(value) + r"(?!\w)", re.IGNORECASE)
    sources = []
    unique = []
    for page in sorted(pages, key=lambda p: str(p["id"])):
        text = page.get("text") or ""
        matches = list(pattern.finditer(text))
        if not matches:
            continue
        # Prefer a context-supported occurrence over a navigation mention.
        candidates = []
        for match in matches[:30]:
            local = text[max(0, match.start() - 180):match.end() + 220]
            quality = assess_intelligence_lead({**entity, "context_snippet": local, "context": local})
            candidates.append((quality["usable"], quality["score"], local, quality))
        _, _, passage, quality = max(candidates, key=lambda x: (x[0], x[1]))
        excerpt = evidence_excerpt(passage, value, max_chars=420)
        normalized = _normal(excerpt)
        duplicate_of = next((s["page_id"] for s in unique
                             if normalized == s["normalized"] or
                             (len(normalized) > 60 and SequenceMatcher(None, normalized, s["normalized"], autojunk=False).ratio() >= .90)), None)
        url = str(page.get("url") or "")
        try:
            origin = (urlparse(url).hostname or "").lower().removeprefix("www.")
        except ValueError:
            origin = ""
        source = {
            "page_id": str(page["id"]), "url": url, "origin": origin,
            "excerpt": excerpt, "collected_at": page.get("collected_at"),
            "published_at": page.get("published_at"),
            "content_sha256": content_digest(text),
            "passage_sha256": content_digest(normalized),
            "duplicate_of": duplicate_of,
            "supports_role": quality["usable"], "reason": quality["reason"],
        }
        sources.append(source)
        if not duplicate_of:
            unique.append({**source, "normalized": normalized})
    return {
        "sources": sources,
        "mention_count": len(sources),
        "distinct_origins": len({s["origin"] for s in unique if s["origin"] and s["supports_role"]}),
        "unique_passages": sum(s["supports_role"] for s in unique),
        "duplicate_count": sum(bool(s["duplicate_of"]) for s in sources),
        "fingerprint": content_digest(json.dumps([
            (s["page_id"], s["content_sha256"], s["url"]) for s in sources
        ], sort_keys=True)),
        "independence": "Not established automatically; different websites can repeat the same claim.",
    }


def organization_match(profile: dict, sources: list[dict]) -> dict:
    """Explicit local text matches are relevance hints, never proof of impact."""
    identifiers = [profile.get("name", ""), *(profile.get("domains") or [])]
    context = [profile.get("sector", ""), profile.get("country", "")]
    matches = []
    for source in sources:
        passage = source["excerpt"]
        direct = [term for term in identifiers if len(term.strip()) >= 3 and re.search(
            r"(?<!\w)" + re.escape(term.strip()) + r"(?!\w)", passage, re.I)]
        contextual = [term for term in context if len(term.strip()) >= 3 and re.search(
            r"(?<!\w)" + re.escape(term.strip()) + r"(?!\w)", passage, re.I)]
        if direct or contextual:
            matches.append({"page_id": source["page_id"], "direct": direct, "contextual": contextual})
    return {"level": "name_or_domain_match" if any(m["direct"] for m in matches) else
            "context_match" if matches else "no_explicit_match", "matches": matches,
            "explanation": "A mention establishes relevance, not that this organization was attacked."}
