"""MTA GTFS-RT feed catalogue and HTTP fetching.

All nine endpoints are public (verified 2026-10-26): no key, CORS ``*``. The
service still fetches them server-side so the browser gets one merged, trimmed
snapshot instead of ~850 KB across nine requests.

A failed feed never aborts the cycle: it is reported in the snapshot's ``feeds``
map so the frontend can show "L data unavailable" instead of silently losing a
quarter of the map.
"""

from __future__ import annotations

import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

BASE = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds"
USER_AGENT = "milovermeulen-transit/0.1 (+https://milovermeulen.com)"

ALERTS_FEED = "subway-alerts"

# One feed per route group, plus the alert feed. Order is the snapshot order.
FEED_NAMES: tuple[str, ...] = (
    "gtfs",
    "gtfs-ace",
    "gtfs-bdfm",
    "gtfs-g",
    "gtfs-jz",
    "gtfs-l",
    "gtfs-nqrw",
    "gtfs-si",
    ALERTS_FEED,
)

# Feeds that carry trains. The alerts feed is merged separately.
TRIP_FEEDS: tuple[str, ...] = tuple(name for name in FEED_NAMES if name != ALERTS_FEED)


def url_for(name: str) -> str:
    """Return the public URL for one feed name."""
    if name == ALERTS_FEED:
        return f"{BASE}/camsys%2F{ALERTS_FEED}"
    return f"{BASE}/nyct%2F{name}"


@dataclass(slots=True)
class FetchResult:
    name: str
    status: int | None
    payload: bytes | None
    error: str | None
    elapsed_ms: int


def fetch(name: str, timeout: float = 10.0, retries: int = 1) -> FetchResult:
    """Fetch one feed. Never raises: failures come back as an error result."""
    url = url_for(name)
    started = time.monotonic()
    attempt = 0
    while True:
        status: int | None = None
        try:
            request = urllib.request.Request(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "application/x-protobuf, */*"},
            )
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = response.read()
            elapsed = int((time.monotonic() - started) * 1000)
            return FetchResult(name, response.status, payload, None, elapsed)
        except urllib.error.HTTPError as exc:
            status = exc.code
            retryable = exc.code >= 500 or exc.code == 429
            error = f"http {exc.code}"
        except (TimeoutError, urllib.error.URLError, OSError) as exc:
            retryable = True
            error = str(exc) or exc.__class__.__name__
        if not retryable or attempt >= retries:
            elapsed = int((time.monotonic() - started) * 1000)
            return FetchResult(name, status, None, error, elapsed)
        attempt += 1
        time.sleep(0.5 * attempt)


def fetch_all(
    names: tuple[str, ...] = FEED_NAMES,
    timeout: float = 10.0,
    retries: int = 1,
    workers: int = 8,
) -> dict[str, FetchResult]:
    """Fetch every feed concurrently. Every name in ``names`` is present in the result."""
    results: dict[str, FetchResult] = {}
    with ThreadPoolExecutor(max_workers=min(workers, len(names))) as pool:
        pending = {pool.submit(fetch, name, timeout, retries): name for name in names}
        for future in as_completed(pending):
            name = pending[future]
            try:
                results[name] = future.result()
            except Exception as exc:  # a crashed worker must not lose the cycle
                results[name] = FetchResult(name, None, None, str(exc) or "fetch failed", 0)
    return results
