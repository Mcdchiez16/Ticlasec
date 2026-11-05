"""Live activity feed for running investigations.

The pipeline modules (``search.search``, ``scraper.scrape``) already report what
they do through the trace hooks in :mod:`progress.trace` (engine queried, URL
found, page fetched, ...), but those hooks are no-ops unless a traced
:class:`progress.ProgressEmitter` is bound. This module binds one for each web
investigation and turns its events into a small, in-memory feed the UI can poll,
so the analyst sees what is happening instead of a bare spinner.

Everything shown here is already display-safe: :mod:`progress.trace` reduces URLs
to shortened/defanged hosts, masks sensitive names and credentials, and drops
anything the content-safety filter blocked. Nothing in this module reads page text.

The feed is in memory only. It lives for the duration of the run (plus an hour so
a finished run can still be reviewed) and is lost if the API restarts; the
investigation record itself is unaffected.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from typing import Any, Optional

logger = logging.getLogger(__name__)

MAX_EVENTS = 600
KEEP_AFTER_FINISH_S = 3600
MAX_RUNS = 50

# Noisy kinds are summarised after the first few so the feed stays readable.
_FOUND_LIMIT = 30
_ENTITY_LIMIT = 24


def _fmt_bytes(n: Any) -> str:
    try:
        n = int(n)
    except (TypeError, ValueError):
        return ""
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.0f} KB"
    return f"{n / 1024 / 1024:.1f} MB"


class RunActivity:
    """Feed, counters and per-engine status for one investigation run."""

    def __init__(self, investigation_id: str, run_id: str = "") -> None:
        self.investigation_id = investigation_id
        self.run_id = run_id
        self._lock = threading.Lock()
        self._events: deque[dict[str, Any]] = deque(maxlen=MAX_EVENTS)
        self._seq = 0
        self._hosts: dict[str, str] = {}
        self._seen_hosts: set[str] = set()
        self.engines: dict[str, dict[str, Any]] = {}
        self.counts: dict[str, int] = {
            "engines_queried": 0,
            "results": 0,
            "urls_found": 0,
            "sites": 0,
            "urls_kept": 0,
            "urls_dropped": 0,
            "pages_fetched": 0,
            "pages_failed": 0,
            "entities": 0,
        }
        self.step = 0
        self.label = ""
        self.done = False
        self.started = time.time()
        self.finished: Optional[float] = None
        self.emitter: Any = None
        self.owns_process_tracer = False

    # -- writing ---------------------------------------------------------------

    def add(self, kind: str, text: str, level: str = "info", **extra: Any) -> None:
        with self._lock:
            self._seq += 1
            event = {
                "seq": self._seq,
                "t": round(time.time() - self.started, 1),
                "kind": kind,
                "level": level,
                "text": text,
            }
            event.update({k: v for k, v in extra.items() if v is not None})
            self._events.append(event)

    def note_step(self, step: Optional[int], label: Optional[str]) -> None:
        changed = False
        with self._lock:
            if step is not None and step != self.step:
                self.step = step
                changed = True
            if label and label != self.label:
                self.label = label
                changed = True
        if changed and label:
            self.add("stage", label, "info")

    def handle(self, event: Any) -> None:
        """Sink for :class:`progress.ProgressEvent`. Never raises."""
        try:
            data = event.to_dict() if hasattr(event, "to_dict") else dict(event)
            if data.get("type") != "trace":
                return
            self._handle_trace(data.get("kind") or "", data.get("data") or {})
        except Exception as exc:  # pragma: no cover - defensive
            logger.debug("activity sink failed (ignored): %s", exc)

    def _handle_trace(self, kind: str, d: dict[str, Any]) -> None:
        c = self.counts
        if kind == "query.refined":
            text = str(d.get("text") or "")
            if text:
                label = "Refined search" if int(d.get("index") or 0) == 0 else "Alternative search"
                self.add("query", f"{label}: “{text}”")
        elif kind == "search.request":
            name = str(d.get("engine") or "engine")
            with self._lock:
                first_request = not self.engines
                self.engines.setdefault(name, {"status": "querying", "results": 0, "ms": None})
                self.engines[name]["status"] = "querying"
                c["engines_queried"] = len(self.engines)
            if first_request:
                synthetic = name.lower().startswith("synthetic")
                self.add("search", "Querying the synthetic index" if synthetic else "Querying Tor search engines")
        elif kind == "search.result":
            name = str(d.get("engine") or "engine")
            status = str(d.get("status") or "ok")
            results = int(d.get("results") or 0)
            ms = d.get("ms")
            with self._lock:
                entry = self.engines.setdefault(name, {"status": status, "results": 0, "ms": None})
                entry["status"] = status
                entry["results"] = entry.get("results", 0) + results
                entry["ms"] = ms
                c["engines_queried"] = len(self.engines)
                c["results"] += results
            took = f" in {ms / 1000:.1f}s" if isinstance(ms, (int, float)) and ms else ""
            if status == "ok":
                self.add("result", f"{name} returned {results} result{'s' if results != 1 else ''}{took}", "ok" if results else "info", engine=name)
            elif status == "timeout":
                self.add("result", f"{name} timed out", "warn", engine=name)
            elif status == "disabled":
                self.add("result", f"{name} skipped (temporarily unavailable)", "warn", engine=name)
            elif status == "no_key":
                self.add("result", f"{name} skipped (no API key)", "info", engine=name)
            else:
                self.add("result", f"{name} failed to respond", "warn", engine=name)
        elif kind == "url.found":
            uid = str(d.get("url_id") or "")
            host = str(d.get("host") or "hidden")
            with self._lock:
                self._hosts[uid] = host
                c["urls_found"] += 1
                new_site = host not in self._seen_hosts
                if new_site:
                    self._seen_hosts.add(host)
                    c["sites"] = len(self._seen_hosts)
                n = c["sites"]
            if new_site:
                if n <= _FOUND_LIMIT:
                    self.add("found", f"Found {host}", engine=d.get("engine"), host=host)
                elif n == _FOUND_LIMIT + 1:
                    self.add("found", "Finding more sites (showing totals from here)")
        elif kind == "url.kept":
            with self._lock:
                c["urls_kept"] += 1
        elif kind == "url.dropped":
            with self._lock:
                c["urls_dropped"] += 1
        elif kind == "page.fetched":
            uid = str(d.get("url_id") or "")
            outcome = str(d.get("outcome") or "")
            with self._lock:
                host = self._hosts.get(uid, "a hidden service")
                if outcome == "ok":
                    c["pages_fetched"] += 1
                else:
                    c["pages_failed"] += 1
            if outcome == "ok":
                size = _fmt_bytes(d.get("bytes"))
                ms = d.get("ms")
                bits = [b for b in (f"{ms / 1000:.1f}s" if isinstance(ms, (int, float)) and ms else "", size) if b]
                self.add("fetch", f"Read {host}" + (f" ({', '.join(bits)})" if bits else ""), "ok", host=host)
            elif outcome in ("safety_dropped",):
                self.add("fetch", f"Skipped {host} (content safety)", "info", host=host)
            else:
                reason = {
                    "timeout": "timed out",
                    "tor_error": "unreachable over Tor",
                    "http_404": "not found",
                    "http_4xx": "refused",
                    "http_5xx": "server error",
                    "too_large": "too large",
                    "empty": "no readable content",
                }.get(outcome, "could not be read")
                self.add("fetch", f"{host} {reason}", "warn", host=host)
        elif kind == "page.entities":
            uid = str(d.get("url_id") or "")
            by_type = d.get("by_type") or {}
            total = sum(int(v) for v in by_type.values()) if isinstance(by_type, dict) else 0
            if total:
                with self._lock:
                    host = self._hosts.get(uid, "a page")
                top = sorted(by_type.items(), key=lambda kv: -int(kv[1]))[:3]
                parts = ", ".join(f"{int(v)} {str(k).replace('_', ' ').lower()}" for k, v in top)
                self.add("extract", f"Extracted {total} entities from {host}: {parts}", "ok", host=host)
        elif kind == "entity.found":
            with self._lock:
                c["entities"] += 1
                n = c["entities"]
            if n <= _ENTITY_LIMIT:
                etype = str(d.get("type") or "entity").replace("_", " ").lower()
                self.add("entity", f"Identified {etype}: {d.get('display') or ''}".rstrip(": "), type=d.get("type"))
        elif kind == "enrich.source":
            name = str(d.get("source") or d.get("name") or "source")
            status = str(d.get("status") or "ok")
            self.add("enrich", f"Enrichment {name}: {status}", "ok" if status == "ok" else "info")
        elif kind == "summary.status":
            self.add("summary", "Writing the briefing", "info")

    # -- reading ---------------------------------------------------------------

    def snapshot(self, after: int = 0) -> dict[str, Any]:
        with self._lock:
            events = [e for e in self._events if e["seq"] > after]
            return {
                "active": not self.done,
                "run_id": self.run_id,
                "seq": self._seq,
                "elapsed": round((self.finished or time.time()) - self.started, 1),
                "step": self.step,
                "label": self.label,
                "counts": dict(self.counts),
                "engines": [{"name": k, **v} for k, v in self.engines.items()],
                "events": events,
            }


class ActivityStore:
    """Process-wide registry of run feeds, keyed by investigation id and run id."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._runs: dict[str, RunActivity] = {}
        self._process_owner: Optional[str] = None

    def begin(self, investigation_id: str, run_id: str = "") -> RunActivity:
        run = RunActivity(str(investigation_id), str(run_id or ""))
        with self._lock:
            self._purge_locked()
            self._runs[run.investigation_id] = run
            if run.run_id:
                self._runs[run.run_id] = run
        self._bind(run)
        return run

    def get(self, key: str) -> Optional[RunActivity]:
        with self._lock:
            return self._runs.get(str(key))

    def finish(self, investigation_id: str) -> None:
        run = self.get(str(investigation_id))
        if run is None:
            return
        self._unbind(run)
        run.finished = time.time()
        run.done = True

    def note_step(self, investigation_id: Any, step: Optional[int], label: Optional[str]) -> None:
        run = self.get(str(investigation_id))
        if run is not None and not run.done:
            run.note_step(step, label)

    # -- tracer binding ------------------------------------------------------------

    def _bind(self, run: RunActivity) -> None:
        """Bind a traced emitter so the pipeline hooks report into *run*.

        The context variable covers this task and everything it spawns on the
        event loop. Worker threads that do not inherit context fall back to the
        process-wide tracer, which only one run can hold at a time; concurrent
        runs still get everything that happens on their own task.
        """
        try:
            from progress import CallbackSink, ProgressEmitter
            from progress import trace as _trace

            emitter = ProgressEmitter(
                sinks=[CallbackSink(lambda ev: run.handle(ev))],
                run_id=run.run_id or run.investigation_id,
                trace=True,
            )
            run.emitter = emitter
            with self._lock:
                if self._process_owner is None:
                    self._process_owner = run.investigation_id
                    run.owns_process_tracer = True
            _trace.bind(emitter, process_wide=run.owns_process_tracer)
        except Exception as exc:
            logger.warning("activity feed unavailable (non-fatal): %s", exc)

    def _unbind(self, run: RunActivity) -> None:
        try:
            from progress import trace as _trace

            _trace.bind(None, process_wide=run.owns_process_tracer)
        except Exception:
            pass
        if run.owns_process_tracer:
            with self._lock:
                if self._process_owner == run.investigation_id:
                    self._process_owner = None
            run.owns_process_tracer = False
        if run.emitter is not None:
            try:
                run.emitter.close()
            except Exception:
                pass

    def _purge_locked(self) -> None:
        now = time.time()
        stale = [
            k for k, r in self._runs.items()
            if r.done and r.finished and now - r.finished > KEEP_AFTER_FINISH_S
        ]
        for k in stale:
            self._runs.pop(k, None)
        if len(self._runs) > MAX_RUNS * 2:
            for k in sorted((k for k, r in self._runs.items() if r.done), key=lambda k: self._runs[k].finished or 0)[:MAX_RUNS]:
                self._runs.pop(k, None)


STORE = ActivityStore()
