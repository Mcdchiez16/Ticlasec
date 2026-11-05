"""The live activity feed turns the pipeline's trace hooks into a display-safe feed."""

from api.activity import ActivityStore
from progress import trace as T

ONION = "http://abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion/forum/thread/1"


def _run(store: ActivityStore, key: str = "inv-1"):
    run = store.begin(key, "run-1")
    return run


def test_trace_hooks_populate_counts_engines_and_events():
    store = ActivityStore()
    run = _run(store)
    try:
        T.search_request("Ahmia", 0)
        T.search_result("Ahmia", "ok", 12, 3200, query_index=0)
        T.search_request("Torland", 0)
        T.search_result("Torland", "timeout", 0, 30000, query_index=0)
        T.url_found("collect", ONION, engine="Ahmia", title="thread")
        T.page_fetched(ONION, "ok")
    finally:
        store.finish("inv-1")  # closes the emitter, which flushes queued events

    snap = run.snapshot()
    assert snap["available"] if "available" in snap else True
    assert snap["counts"]["engines_queried"] == 2
    assert snap["counts"]["results"] == 12
    assert snap["counts"]["urls_found"] == 1
    engines = {e["name"]: e for e in snap["engines"]}
    assert engines["Ahmia"]["status"] == "ok" and engines["Ahmia"]["results"] == 12
    assert engines["Torland"]["status"] == "timeout"
    texts = " | ".join(e["text"] for e in snap["events"])
    assert "Querying Tor search engines" in texts
    assert texts.count("Querying Tor search engines") == 1  # one line, not one per engine
    assert "Ahmia returned 12 results" in texts
    assert "Torland timed out" in texts


def test_hosts_are_shortened_and_defanged_never_full_urls():
    store = ActivityStore()
    run = _run(store, "inv-2")
    try:
        T.url_found("collect", ONION, engine="Ahmia")
    finally:
        store.finish("inv-2")
    text = " ".join(e["text"] for e in run.snapshot()["events"])
    assert "[.]onion" in text
    assert "/forum/thread" not in text
    assert "http" not in text


def test_snapshot_after_returns_only_new_events_and_step_labels_flow_through():
    store = ActivityStore()
    run = _run(store, "inv-3")
    store.note_step("inv-3", 2, "Searching dark web")
    first = run.snapshot()
    assert first["step"] == 2 and first["label"] == "Searching dark web"
    store.note_step("inv-3", 4, "Scraping pages")
    later = run.snapshot(after=first["seq"])
    assert [e["text"] for e in later["events"]] == ["Scraping pages"]
    store.finish("inv-3")
    assert run.snapshot()["active"] is False


def test_unbinds_tracer_when_finished():
    store = ActivityStore()
    _run(store, "inv-4")
    assert T.active()
    store.finish("inv-4")
    assert not T.active()


def test_lookup_by_run_id_and_unknown_key():
    store = ActivityStore()
    run = _run(store, "inv-5")
    assert store.get("run-1") is run
    assert store.get("nope") is None
    store.finish("inv-5")


def test_repeated_host_is_listed_once_but_counts_urls():
    store = ActivityStore()
    run = _run(store, "inv-6")
    try:
        T.url_found("collect", ONION + "a", engine="Ahmia")
        T.url_found("collect", ONION + "b", engine="Torland")
    finally:
        store.finish("inv-6")
    snap = run.snapshot()
    assert snap["counts"]["urls_found"] == 2
    assert snap["counts"]["sites"] == 1
    assert sum(1 for e in snap["events"] if e["kind"] == "found") == 1
