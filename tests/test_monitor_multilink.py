from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session
from api.routes.monitors import create_monitor, CreateMonitorRequest
from db.models import Monitor, User
from monitor.validation import normalize_urls


def test_normalize_and_deduplicate():
    assert normalize_urls(["https://EXAMPLE.org", "https://example.org/#section", "http://second.onion/page"]) == ["https://example.org/", "http://second.onion/page"]
    assert normalize_urls(None, "https://example.org") == ["https://example.org/"]


@pytest.mark.parametrize("urls", [[], ["file:///etc/passwd"], ["http://localhost"], ["http://127.0.0.1"],
    ["http://[::1]"], ["https://user:pass@example.org"], ["https://a.org"] * 26, ["not a link"]])
def test_reject_invalid_targets(urls):
    with pytest.raises(ValueError): normalize_urls(urls)


@pytest.mark.asyncio
async def test_create_many_targets_and_fractional_interval(db_engine, monkeypatch):
    monkeypatch.setattr("api.routes.monitors.import_legacy_watches", lambda session: None)
    with Session(db_engine) as session:
        user = User(email="multiple@test", hashed_password="unused")
        session.add(user); session.commit(); owner = user.id
    scheduler = MagicMock()
    monkeypatch.setattr("api.routes.monitors._scheduler", scheduler)
    result = await create_monitor(CreateMonitorRequest(name="Several links", type="url",
        urls=["https://one.org/", "https://two.org/"], interval_hours=0.75),
        current=SimpleNamespace(user=SimpleNamespace(id=owner)))
    assert result["created"]
    with Session(db_engine) as session:
        row = session.query(Monitor).one()
        assert row.config["urls"] == ["https://one.org/", "https://two.org/"]
        assert row.config["url"] == "https://one.org/"
    assert scheduler.add_job.call_args.kwargs["hours"] == 0.75
    assert scheduler.add_job.call_args.kwargs["max_instances"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("interval", [0, -1, 0.1, 721, float("nan"), float("inf")])
async def test_server_rejects_invalid_custom_interval(interval):
    with pytest.raises(HTTPException) as error:
        await create_monitor(CreateMonitorRequest(name="bad", type="keyword", query="test", interval_hours=interval), current=None)
    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_channels_require_owned_connection(db_engine, monkeypatch):
    with pytest.raises(HTTPException) as error:
        await create_monitor(CreateMonitorRequest(name="bad", type="keyword", query="test", connected_channels=["telegram"]),
            current=SimpleNamespace(user=SimpleNamespace(id=999)))
    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_scheduler_evaluates_each_url_independently(monkeypatch):
    from monitor.scheduler import _wrap_url
    results = [{"url": "https://one.org", "changed": True}, {"url": "https://two.org", "changed": False}]
    monkeypatch.setattr("monitor.scheduler._watch_is_active", lambda watch: True)
    monkeypatch.setattr("monitor.jobs.run_url_watch", AsyncMock(return_value={"results": results}))
    dispatch = AsyncMock()
    monkeypatch.setattr("monitor.scheduler.evaluate_and_dispatch_alerts", dispatch)
    watch = {"name": "links"}
    await _wrap_url(watch, None)()
    assert [call.args[1] for call in dispatch.await_args_list] == results


@pytest.mark.asyncio
async def test_multilink_runs_every_target_and_preserves_failed_baseline(db_engine, monkeypatch):
    import monitor.jobs as jobs
    from contextlib import contextmanager
    @contextmanager
    def fake_session(): yield MagicMock()
    monkeypatch.setattr("db.session.get_session", fake_session)
    monkeypatch.setattr(jobs, "get_investigation_by_query", lambda *args, **kwargs: SimpleNamespace(id="test"))
    monkeypatch.setattr(jobs._db, "get_last_cleaned_text_for_url", lambda *args, **kwargs: "old")
    baseline = MagicMock()
    monkeypatch.setattr(jobs._db, "save_watch_baseline", baseline)
    monkeypatch.setattr(jobs._db, "update_source_watch_fingerprint", MagicMock())
    monkeypatch.setattr(jobs.vector, "upsert_page", MagicMock())
    monkeypatch.setattr(jobs, "extract_entities_from_page", AsyncMock(return_value=SimpleNamespace(entity_count=0)))
    fetch = AsyncMock(side_effect=lambda data: {data[0]["link"]: "new"} if "one" in data[0]["link"] else {})
    monkeypatch.setattr(jobs.scrape, "scrape_multiple", fetch)
    result = await jobs.run_url_watch({"name": "links", "urls": ["http://one.onion/", "http://two.onion/"]})
    assert fetch.await_count == 2
    assert result["results"][0]["changed"] is True
    assert result["results"][1]["changed"] is False
    assert result["results"][1]["errors"]
    baseline.assert_called_once()
