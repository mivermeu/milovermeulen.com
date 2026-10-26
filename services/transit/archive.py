"""Cold storage for transit data.

Three tiers, by how replaceable the data is:

* ``raw/``    byte-exact protobuf as received, gzipped, short retention. This is
  what makes replay and parser changes safe; nothing else can reconstruct it.
* ``series/`` one compact row per train per cycle, gzipped JSONL, longer
  retention. Cheap enough to keep for months, rich enough for delay analysis.
* ``meta/``   one row per poll cycle: per-feed status, latency, byte counts.
  Also the history behind the frontend's degraded-feed banner.
* ``bad/``    payloads that failed validation, kept so a bad feed can be
  reproduced instead of guessed at.

Everything is pruned by file mtime, so retention needs no index or database.
"""

from __future__ import annotations

import contextlib
import gzip
import json
import os
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class ArchiveConfig:
    root: Path
    raw_hours: int = 48
    series_days: int = 90
    bad_days: int = 7


def _day(ts: float) -> str:
    return datetime.fromtimestamp(ts, UTC).strftime("%Y-%m-%d")


def _hour(ts: float) -> str:
    return datetime.fromtimestamp(ts, UTC).strftime("%H")


class Archive:
    def __init__(self, config: ArchiveConfig) -> None:
        self.config = config

    # -- writing -----------------------------------------------------------

    def write_raw(self, name: str, payload: bytes, now: float | None = None) -> Path:
        stamp = time.time() if now is None else now
        directory = self.config.root / "raw" / _day(stamp) / _hour(stamp)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{name}-{int(stamp * 1000)}.pb.gz"
        path.write_bytes(gzip.compress(payload, compresslevel=6))
        return path

    def write_bad(self, name: str, payload: bytes, reason: str, now: float | None = None) -> Path:
        stamp = time.time() if now is None else now
        directory = self.config.root / "bad" / _day(stamp)
        directory.mkdir(parents=True, exist_ok=True)
        safe_reason = "".join(char if char.isalnum() else "-" for char in reason)[:40]
        path = directory / f"{name}-{int(stamp * 1000)}-{safe_reason}.pb"
        path.write_bytes(payload)
        return path

    def append_series(self, trains: list[dict[str, Any]], now: float | None = None) -> int:
        if not trains:
            return 0
        stamp = time.time() if now is None else now
        path = self.config.root / "series" / f"{_day(stamp)}.jsonl.gz"
        path.parent.mkdir(parents=True, exist_ok=True)
        rows = []
        for train in trains:
            row = {
                "t": int(stamp),
                "id": train.get("id"),
                "trip": train.get("trip"),
                "route": train.get("route"),
                "dir": train.get("dir"),
                "st": train.get("status"),
                "stop": train.get("stop"),
                "seq": train.get("seq"),
                "next": [
                    [entry.get("stop"), entry.get("arr"), entry.get("dep")]
                    for entry in train.get("next", [])
                ],
            }
            rows.append(json.dumps(row, separators=(",", ":")) + "\n")

        # One complete gzip member per cycle, appended in a single write and
        # fsynced: a reader never sees a half-written row, and a crash costs at
        # most the newest cycle. A crash *during* that write can still truncate
        # the tail, so analysis readers should stop at the first bad member
        # (`gzip -dc` does) rather than assume the file is whole.
        member = gzip.compress("".join(rows).encode("utf-8"), compresslevel=6)
        with path.open("ab") as handle:
            handle.write(member)
            handle.flush()
            os.fsync(handle.fileno())
        return len(trains)

    def append_meta(self, record: dict[str, Any], now: float | None = None) -> None:
        stamp = time.time() if now is None else now
        directory = self.config.root / "meta"
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{_day(stamp)}.jsonl"
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, separators=(",", ":")) + "\n")

    # -- retention ---------------------------------------------------------

    def prune(self, now: float | None = None) -> int:
        stamp = time.time() if now is None else now
        cutoffs = {
            "raw": stamp - self.config.raw_hours * 3600,
            "series": stamp - self.config.series_days * 86400,
            "meta": stamp - self.config.series_days * 86400,
            "bad": stamp - self.config.bad_days * 86400,
        }
        removed = 0
        for path in list(self.config.root.rglob("*")):
            if not path.is_file():
                continue
            cutoff = cutoffs.get(path.relative_to(self.config.root).parts[0])
            if cutoff is not None and path.stat().st_mtime < cutoff:
                path.unlink()
                removed += 1
        directories = [path for path in self.config.root.rglob("*") if path.is_dir()]
        for directory in sorted(directories, key=lambda path: len(path.parts), reverse=True):
            with contextlib.suppress(OSError):
                directory.rmdir()
        return removed
