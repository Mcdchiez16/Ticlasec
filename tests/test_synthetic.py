"""Synthetic scenarios: well-formed, deterministic, and served without the network."""

from __future__ import annotations

import asyncio
import json
import re

import pytest

import synthetic.engine as engine
from synthetic import all_scenarios, get_scenario, synthetic_scrape, synthetic_search
from synthetic import filler
from synthetic import generator as g


def test_builtin_scenarios_are_complete():
    scenarios = all_scenarios()
    assert {"zambia-copperbelt-ransomware", "zambia-mobile-money-market", "zambia-sms-phishing-kit"} <= set(scenarios)
    for scenario in scenarios.values():
        urls = [p.url for p in scenario.pages]
        assert len(urls) == len(set(urls)), scenario.id
        assert len(urls) >= (filler.TARGET_PAGES if scenario.builtin else 1), scenario.id
        assert scenario.suggested_query and scenario.highlights
        assert all(p.text.strip() and re.fullmatch(r"http://[a-z2-7]{56}\.onion/.*", p.url) for p in scenario.pages)


def test_scenarios_are_deterministic():
    first = {sid: [(p.url, p.text) for p in s.pages] for sid, s in all_scenarios().items()}
    second = {sid: [(p.url, p.text) for p in s.pages] for sid, s in all_scenarios().items()}
    assert first == second


def test_generated_identifiers_are_valid():
    import random

    from extractor.normalizer import _validate_bitcoin_address

    rng = random.Random(3)
    assert all(_validate_bitcoin_address(g.btc_address(rng)) for _ in range(50))
    assert all(re.fullmatch(r"4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}", g.xmr_address(rng)) for _ in range(50))
    assert re.fullmatch(r"[a-z2-7]{55}d\.onion", g.onion_host(rng))


def test_builtin_scenarios_are_zambia_scoped_and_score_high():
    from intelligence_scope import normalize_scope, score_text

    scope = normalize_scope({"profile_id": "zambia"})
    for scenario in all_scenarios().values():
        assert scenario.scope == "zambia"
        assert score_text(" ".join(p.text for p in scenario.pages), scope)["level"] == "high", scenario.id
        local = sum(1 for p in scenario.pages if score_text(p.text, scope)["score"] > 0)
        assert local >= 0.75 * len(scenario.pages), scenario.id


def test_unknown_scenario_is_none():
    assert get_scenario(None) is None
    assert get_scenario("nope") is None


def test_search_and_scrape_serve_scenario_pages(monkeypatch):
    monkeypatch.setenv("SYNTHETIC_PACE", "0")
    scenario = get_scenario("zambia-sms-phishing-kit")

    async def run():
        results = await synthetic_search(scenario)
        pages = await synthetic_scrape(scenario, [{"link": r["link"]} for r in results] + [{"link": "http://elsewhere.onion/"}])
        return results, pages

    results, pages = asyncio.run(run())
    assert len(results) == len(scenario.pages)
    assert set(pages) == {p.url for p in scenario.pages}  # unknown URLs are never invented


def test_custom_pack_loading(tmp_path, monkeypatch):
    good = {"id": "My_Pack", "title": "Mine", "pages": [{"url": "http://a.onion/x", "text": "hello"}, {"url": "", "text": "skipped"}]}
    (tmp_path / "good.json").write_text(json.dumps(good))
    (tmp_path / "bad_id.json").write_text(json.dumps({"id": "no spaces allowed", "pages": [{"url": "u", "text": "t"}]}))
    (tmp_path / "empty.json").write_text(json.dumps({"id": "empty", "pages": []}))
    (tmp_path / "broken.json").write_text("{not json")
    monkeypatch.setattr(engine, "CUSTOM_DIR", tmp_path)

    scenarios = all_scenarios()
    assert "my_pack" in scenarios and not scenarios["my_pack"].builtin
    assert len(scenarios["my_pack"].pages) == 1
    assert not {"no spaces allowed", "empty"} & set(scenarios)


def test_custom_pack_cannot_shadow_builtin(tmp_path, monkeypatch):
    (tmp_path / "x.json").write_text(json.dumps({"id": "zambia-sms-phishing-kit", "pages": [{"url": "u", "text": "t"}]}))
    monkeypatch.setattr(engine, "CUSTOM_DIR", tmp_path)
    assert all_scenarios()["zambia-sms-phishing-kit"].builtin
