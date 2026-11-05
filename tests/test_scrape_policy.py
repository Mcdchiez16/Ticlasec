"""Standard and Deep must bound how long dead onion pages can hold up an investigation.

A page that only times out used to be retried three more times with 2/4/8 s backoff
(about 54 s per dead onion), uncapped, which made Standard take minutes. Each depth now
has a per-page attempt limit and an overall scraping budget.
"""

from api.routes.investigations import _depth_profile

TOR_WORST_CASE_PER_DEAD_PAGE_S = 54  # the old Standard/Deep behaviour


def _worst_case_dead_page(profile) -> float:
    tries = profile["scrape_retries"] + 1
    backoff = sum((2, 4, 8)[: profile["scrape_retries"]])
    return tries * profile["scrape_attempt_timeout"] + backoff


def test_standard_tries_each_page_once_with_a_budget():
    _, standard = _depth_profile("standard")
    assert standard["scrape_retries"] == 0
    assert 0 < standard["scrape_timeout"] <= 120
    assert 0 < standard["scrape_limit"] <= 40
    assert _worst_case_dead_page(standard) < TOR_WORST_CASE_PER_DEAD_PAGE_S / 2


def test_deep_is_patient_but_bounded():
    _, deep = _depth_profile("deep")
    assert deep["scrape_retries"] <= 1
    assert 0 < deep["scrape_timeout"] <= 300
    assert 0 < deep["scrape_limit"] <= 80
    assert deep["scrape_workers"] <= 6  # keeps Tor load bounded
    assert _worst_case_dead_page(deep) < TOR_WORST_CASE_PER_DEAD_PAGE_S


def test_policy_gets_longer_with_depth():
    _, fast = _depth_profile("fast")
    _, standard = _depth_profile("standard")
    _, deep = _depth_profile("deep")
    assert fast["scrape_timeout"] < standard["scrape_timeout"] < deep["scrape_timeout"]
    assert fast["scrape_limit"] < standard["scrape_limit"] < deep["scrape_limit"]


async def test_explicit_attempt_timeout_reaches_the_request_so_slow_onions_succeed_first_try():
    """The pooled Tor session defaults (3 s connect) must not cut an onion's first attempt short."""
    import aiohttp

    from scraper import scrape

    seen = []

    class Resp:
        status = 200
        headers = {"Content-Type": "text/html"}
        charset = "utf-8"

        class content:  # noqa: N801 - mimics aiohttp's StreamReader
            @staticmethod
            async def iter_chunked(_n):
                yield b"<html><body>" + b"threat intelligence evidence " * 30 + b"</body></html>"

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

    class Session:
        def get(self, url, headers=None, **kw):
            seen.append(kw.get("timeout"))
            return Resp()

    url = "http://abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion/page"
    import asyncio

    out = await scrape._fetch_one_impl(
        Session(), {"link": url, "title": "t"}, asyncio.Semaphore(1), max_retries=0, per_attempt_timeout=25
    )
    assert out[2] is not None  # content came back
    timeout = seen[0]
    assert isinstance(timeout, aiohttp.ClientTimeout)
    assert timeout.connect == 25 and timeout.sock_read == 25 and timeout.total is None


async def test_default_call_keeps_the_session_timeouts():
    from scraper import scrape
    import asyncio

    seen = []

    class Resp:
        status = 404
        headers = {}

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

    class Session:
        def get(self, url, headers=None, **kw):
            seen.append("timeout" in kw)
            return Resp()

    await scrape._fetch_one_impl(Session(), {"link": "http://example.com/x", "title": "t"}, asyncio.Semaphore(1))
    assert seen == [False]
