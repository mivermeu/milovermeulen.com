"""Poll the MTA GTFS-RT feeds, archive them, and publish a merged snapshot.

The loop is deliberately boring: fetch, validate, archive, merge, write, prune.
A failed feed or a crashed cycle is logged and the next one starts on schedule —
the snapshot keeps the last good data rather than disappearing.
"""

from __future__ import annotations

import json
import logging
import os
import signal
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import archive, feeds, gtfs, snapshot

log = logging.getLogger("transit.poller")

SNAPSHOT_NAME = "snapshot.json"


@dataclass(slots=True)
class Config:
    data_dir: Path
    www_dir: Path
    interval: float = 30.0
    timeout: float = 10.0
    raw_hours: int = 48
    series_days: int = 90
    series_every: int = 2
    bad_days: int = 7
    prune_seconds: float = 3600.0

    @classmethod
    def from_env(cls) -> Config:
        return cls(
            data_dir=Path(os.environ.get("TRANSIT_DATA_DIR", "/var/lib/transit-archive")),
            www_dir=Path(os.environ.get("TRANSIT_WWW_DIR", "/var/www/transit-api")),
            interval=float(os.environ.get("TRANSIT_INTERVAL", "30")),
            timeout=float(os.environ.get("TRANSIT_HTTP_TIMEOUT", "10")),
            raw_hours=int(os.environ.get("TRANSIT_RAW_HOURS", "48")),
            series_days=int(os.environ.get("TRANSIT_SERIES_DAYS", "90")),
            series_every=int(os.environ.get("TRANSIT_SERIES_EVERY", "2")),
            bad_days=int(os.environ.get("TRANSIT_BAD_DAYS", "7")),
            prune_seconds=float(os.environ.get("TRANSIT_PRUNE_SECONDS", "3600")),
        )


class Poller:
    def __init__(
        self,
        config: Config,
        fetcher: Callable[..., dict[str, feeds.FetchResult]] = feeds.fetch_all,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.config = config
        self.fetcher = fetcher
        self.clock = clock
        self.archive = archive.Archive(
            archive.ArchiveConfig(
                root=config.data_dir,
                raw_hours=config.raw_hours,
                series_days=config.series_days,
                bad_days=config.bad_days,
            )
        )
        self.cycles = 0
        self._last_prune = 0.0
        self._stop = threading.Event()

    def tick(self) -> dict[str, Any]:
        """Run one fetch/archive/merge cycle and return the snapshot written."""
        started = self.clock()
        results = self.fetcher(feeds.FEED_NAMES, timeout=self.config.timeout)
        parsed: dict[str, gtfs.Feed] = {}
        health: dict[str, dict[str, Any]] = {}
        bytes_total = 0

        for name in feeds.FEED_NAMES:
            result = results.get(name)
            entry: dict[str, Any] = {
                "ok": False,
                "status": None,
                "age_s": None,
                "trips": 0,
                "vehicles": 0,
                "alerts": 0,
                "error": "no result",
            }
            if result is not None:
                entry["status"] = result.status
                entry["error"] = result.error
                if result.payload is not None:
                    bytes_total += len(result.payload)
                    try:
                        feed = gtfs.parse_feed(result.payload)
                        if feed.incrementality not in (None, 0):
                            # DIFFERENTIAL feeds only carry deltas; merging them as if
                            # they were full datasets would silently drop trains.
                            raise gtfs.GtfsRtError(
                                f"unsupported incrementality {feed.incrementality}"
                            )
                    except gtfs.GtfsRtError as exc:
                        self.archive.write_bad(name, result.payload, str(exc), started)
                        entry["error"] = f"invalid feed: {exc}"
                    else:
                        self.archive.write_raw(name, result.payload, started)
                        parsed[name] = feed
                        entry.update(
                            ok=True,
                            error=None,
                            trips=len(feed.trip_updates),
                            vehicles=len(feed.vehicles),
                            alerts=len(feed.alerts),
                        )
                        if feed.header_ts:
                            entry["age_s"] = max(0, int(started - feed.header_ts))
            health[name] = entry

        trip_feeds = {name: feed for name, feed in parsed.items() if name in feeds.TRIP_FEEDS}
        document = snapshot.build(trip_feeds, parsed.get(feeds.ALERTS_FEED), health, started)
        self._write_snapshot(document)

        self.cycles += 1
        if self.cycles % max(1, self.config.series_every) == 0:
            self.archive.append_series(document["trains"], started)

        failed = [name for name, entry in health.items() if not entry["ok"]]
        self.archive.append_meta(
            {
                "t": int(started),
                "trains": len(document["trains"]),
                "alerts": len(document["alerts"]),
                "ok": len(health) - len(failed),
                "failed": failed,
                "bytes": bytes_total,
                "ms": {
                    name: result.elapsed_ms
                    for name, result in results.items()
                    if result is not None
                },
            },
            started,
        )

        # Time-based, not cycle-based: a restart loop must not disable retention.
        if started - self._last_prune >= self.config.prune_seconds:
            self._last_prune = started
            removed = self.archive.prune(started)
            if removed:
                log.info("pruned %d archived files", removed)

        log.info(
            "cycle %d: trains=%d alerts=%d feeds=%d/%d bytes=%d failed=%s",
            self.cycles,
            len(document["trains"]),
            len(document["alerts"]),
            len(health) - len(failed),
            len(health),
            bytes_total,
            ",".join(failed) or "-",
        )
        return document

    def _write_snapshot(self, document: dict[str, Any]) -> None:
        payload = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        self.config.www_dir.mkdir(parents=True, exist_ok=True)
        path = self.config.www_dir / SNAPSHOT_NAME
        # pid in the name so a manual run cannot publish a torn file over the
        # service's; fsync so a power loss cannot leave a zero-length snapshot.
        temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        with temporary.open("wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)

    def run_forever(self) -> None:
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, self._request_stop)
        next_run = time.monotonic()
        while not self._stop.is_set():
            try:
                self.tick()
            except Exception:
                log.exception("poll cycle failed; retrying next interval")
            next_run += self.config.interval
            delay = max(0.0, next_run - time.monotonic())
            if self._stop.wait(delay):
                break
            if delay == 0:
                next_run = time.monotonic()

    def _request_stop(self, signum: int, _frame: object) -> None:
        log.info("received signal %d, shutting down", signum)
        self._stop.set()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    config = Config.from_env()
    poller = Poller(config)
    log.info(
        "transit poller starting: data=%s www=%s interval=%ss",
        config.data_dir,
        config.www_dir,
        config.interval,
    )
    try:
        poller.run_forever()
    finally:
        log.info("transit poller stopped")


if __name__ == "__main__":
    main()
