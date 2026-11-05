"""Validated access to the public, frozen 50-document synthetic corpus."""

from __future__ import annotations

from copy import deepcopy
from functools import lru_cache
import hashlib
import json
from pathlib import Path


CORPUS_PATH = Path(__file__).resolve().parent / "data" / "frozen_50.json"


@lru_cache(maxsize=1)
def _load_validated() -> dict:
    payload = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    manifest = payload.get("manifest") or {}
    documents = payload.get("documents") or []

    if len(documents) != 50 or manifest.get("documents") != 50:
        raise ValueError("The frozen synthetic corpus must contain exactly 50 documents")

    ids = [row.get("id") for row in documents]
    expected_ids = [f"SYN-{index:03d}" for index in range(1, 51)]
    if ids != expected_ids or len(set(ids)) != 50:
        raise ValueError("The frozen synthetic corpus IDs are incomplete or out of order")

    for row in documents:
        text = row.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"{row.get('id', 'unknown')} has no text")
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        if digest != row.get("content_sha256"):
            raise ValueError(f"{row['id']} content hash mismatch")
        if len(text.split()) != row.get("word_count"):
            raise ValueError(f"{row['id']} word count mismatch")
        if row.get("source_class") != "synthetic":
            raise ValueError(f"{row['id']} is not marked synthetic")

    canonical = json.dumps(
        documents, sort_keys=True, ensure_ascii=False, separators=(",", ":")
    )
    dataset_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    if dataset_hash != manifest.get("dataset_sha256"):
        raise ValueError("The frozen synthetic corpus dataset hash mismatch")

    return payload


def frozen_synthetic_corpus() -> dict:
    """Return a defensive copy so request handlers cannot mutate cached data."""
    return deepcopy(_load_validated())
