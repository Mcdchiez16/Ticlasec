"""Run an investigation over synthetic pages instead of the live network.

The pipeline is unchanged from the search results onwards: pages go through the same
content-safety gate, entity extraction, graph build and briefing as real ones. Only the
two stages that touch the outside world are replaced:

* :func:`synthetic_search` stands in for the Tor search engines.
* :func:`synthetic_scrape` stands in for the scraper.

Both report through the same trace hooks the real stages use, so the live activity
feed and its counters behave as they do on a live run. ``SYNTHETIC_PACE`` scales the
short pauses that keep the feed readable (``0`` removes them, e.g. in tests).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, Iterable, Optional

from progress import trace as _trace

from .scenarios import BUILTIN_BUILDERS, Scenario, SyntheticPage

logger = logging.getLogger(__name__)

ENGINES = ("Synthetic index · Alpha", "Synthetic index · Beta", "Synthetic index · Gamma")
CUSTOM_DIR = Path(__file__).resolve().parent.parent / "data" / "synthetic"
MAX_CUSTOM_PAGES = 200
MAX_PAGE_CHARS = 60_000


def _pace() -> float:
    try:
        return max(0.0, float(os.getenv("SYNTHETIC_PACE", "1")))
    except ValueError:
        return 1.0


async def _pause(seconds: float) -> None:
    delay = seconds * _pace()
    if delay > 0:
        await asyncio.sleep(delay)


# ── loading ──────────────────────────────────────────────────────────────────


def _load_custom_pack(path: Path) -> Optional[Scenario]:
    """Read one ``data/synthetic/*.json`` pack. Returns ``None`` (and logs) if it is unusable."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        scenario_id = str(raw.get("id") or path.stem).strip().lower()
        if not scenario_id or not all(c.isalnum() or c in "-_" for c in scenario_id):
            raise ValueError("id must be letters, digits, '-' or '_'")
        pages: list[SyntheticPage] = []
        for item in (raw.get("pages") or [])[:MAX_CUSTOM_PAGES]:
            url, text = str(item.get("url") or "").strip(), str(item.get("text") or "").strip()
            if not url or not text:
                continue
            title = str(item.get("title") or url)[:200]
            pages.append(
                SyntheticPage(
                    url=url,
                    title=title,
                    text=text[:MAX_PAGE_CHARS],
                    snippet=" ".join(text.split())[:180],
                )
            )
        if not pages:
            raise ValueError("no pages with both 'url' and 'text'")
        return Scenario(
            id=scenario_id,
            title=str(raw.get("title") or scenario_id)[:120],
            description=str(raw.get("description") or "Custom synthetic dataset.")[:400],
            suggested_query=str(raw.get("suggested_query") or raw.get("title") or scenario_id)[:200],
            pages=pages,
            highlights=[str(h)[:160] for h in (raw.get("highlights") or [])][:6],
            builtin=False,
            scope=str(raw.get("scope") or "global").strip().lower()[:32],
        )
    except Exception as exc:
        logger.warning("Ignoring synthetic pack %s: %s", path.name, exc)
        return None


def all_scenarios() -> dict[str, Scenario]:
    """Built-in scenarios plus any custom packs found in ``data/synthetic``."""
    found: dict[str, Scenario] = {}
    for build in BUILTIN_BUILDERS:
        scenario = build()
        found[scenario.id] = scenario
    if CUSTOM_DIR.is_dir():
        for path in sorted(CUSTOM_DIR.glob("*.json")):
            scenario = _load_custom_pack(path)
            if scenario is not None and scenario.id not in found:
                found[scenario.id] = scenario
    return found


def list_scenarios() -> list[dict[str, Any]]:
    return [s.summary() for s in all_scenarios().values()]


def get_scenario(scenario_id: Optional[str]) -> Optional[Scenario]:
    if not scenario_id:
        return None
    return all_scenarios().get(str(scenario_id).strip().lower())


# ── pipeline stand-ins ───────────────────────────────────────────────────────


async def synthetic_search(scenario: Scenario) -> list[dict[str, Any]]:
    """Stand-in for the search-engine fan-out. Returns result dicts like the real one."""
    results: list[dict[str, Any]] = []
    shares: dict[str, list[SyntheticPage]] = {name: [] for name in ENGINES}
    for index, page in enumerate(scenario.pages):
        shares[ENGINES[index % len(ENGINES)]].append(page)

    for name in ENGINES:
        _trace.search_request(name)
    for position, name in enumerate(ENGINES):
        await _pause(0.5 + 0.4 * position)
        mine = shares[name]
        _trace.search_result(name, "ok", len(mine), ms=int(420 + 260 * position))
        for page in mine:
            _trace.url_found("collect", page.url, engine=name, title=page.title)
            results.append(
                {
                    "link": page.url,
                    "title": page.title,
                    "snippet": page.snippet,
                    "source_engine": name,
                    "source_weight": 0.9,
                }
            )
    return results


async def synthetic_scrape(scenario: Scenario, urls_data: Iterable[Any]) -> dict[str, str]:
    """Stand-in for ``scrape_multiple``: serves scenario pages for the requested URLs."""
    by_url = {page.url: page for page in scenario.pages}
    served: dict[str, str] = {}
    for item in urls_data:
        url = item.get("link") if isinstance(item, dict) else str(item)
        page = by_url.get(url or "")
        if page is None:
            continue
        await _pause(0.3)
        size = len(page.text.encode("utf-8"))
        _trace.note_fetch(page.url, http_status=200, nbytes=size, ms=int(300 + (size % 700)))
        _trace.page_fetched(page.url, "ok")
        served[page.url] = page.text
    return served
