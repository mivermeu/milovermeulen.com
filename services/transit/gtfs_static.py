"""Static GTFS: fetch, version and parse the subway feed.

The supplemented feed (``gtfs_supplemented.zip``) is the one realtime actually
runs — the plain ``gtfs_subway.zip`` lags it and matches far fewer live trips.
Every download is kept by checksum, because replay needs the schedule that was
live at the time and the feed's service window expires.
"""

from __future__ import annotations

import csv
import hashlib
import io
import logging
import os
import urllib.request
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

log = logging.getLogger("transit.static")

STATIC_URL = "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_supplemented.zip"
USER_AGENT = "milovermeulen-transit/0.1 (+https://milovermeulen.com)"

TABLES = (
    "stops.txt",
    "trips.txt",
    "stop_times.txt",
    "shapes.txt",
    "routes.txt",
    "feed_info.txt",
)

# The graph builder streams the two big tables; these four are small enough to hold.
SMALL_TABLES = ("stops.txt", "trips.txt", "routes.txt", "feed_info.txt")

Rows = list[dict[str, str]]


@dataclass(slots=True)
class FeedInfo:
    version: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    checksum: str = ""

    def expired(self, today: date | None = None) -> bool:
        if not self.end_date:
            return False
        try:
            end = datetime.strptime(self.end_date, "%Y%m%d").date()
        except ValueError:
            return False
        return (today or datetime.now(UTC).date()) > end

    def days_left(self, today: date | None = None) -> int | None:
        if not self.end_date:
            return None
        try:
            end = datetime.strptime(self.end_date, "%Y%m%d").date()
        except ValueError:
            return None
        return (end - (today or datetime.now(UTC).date())).days


def parse_feed_info(payload: bytes) -> FeedInfo:
    with (
        zipfile.ZipFile(io.BytesIO(payload)) as archive,
        archive.open("feed_info.txt") as handle,
    ):
        reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig"))
        row = next(reader, {})
    return FeedInfo(
        version=row.get("feed_version"),
        start_date=row.get("feed_start_date"),
        end_date=row.get("feed_end_date"),
    )


def download(directory: Path, timeout: float = 60.0) -> tuple[Path, FeedInfo]:
    """Fetch the feed and store it by checksum. Idempotent for the same content."""
    directory.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(STATIC_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = response.read()
    checksum = hashlib.sha256(payload).hexdigest()[:12]
    info = parse_feed_info(payload)
    info.checksum = checksum
    path = directory / f"gtfs-{info.version or 'unknown'}-{checksum}.zip"
    if path.exists() and _valid_archive(path):
        log.info("static feed already stored: %s", path.name)
        return path, info
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    with temporary.open("wb") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
    log.info("static feed stored: %s (%.1f MB)", path.name, len(payload) / 1e6)
    return path, info


def _valid_archive(path: Path) -> bool:
    try:
        with zipfile.ZipFile(path) as archive:
            return archive.testzip() is None and "feed_info.txt" in archive.namelist()
    except (OSError, zipfile.BadZipFile):
        return False


def latest(directory: Path) -> Path | None:
    archives = sorted(directory.glob("gtfs-*.zip"))
    if not archives:
        return None
    return max(archives, key=lambda path: path.stat().st_mtime)


def read_tables(path: Path, names: tuple[str, ...] = TABLES) -> dict[str, Rows]:
    """Read the named tables into memory."""
    tables: dict[str, Rows] = {}
    with zipfile.ZipFile(path) as archive:
        available = set(archive.namelist())
        for name in names:
            if name not in available:
                tables[name] = []
                continue
            with archive.open(name) as handle:
                reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig"))
                tables[name] = [dict(row) for row in reader]
    return tables


def stream_rows(path: Path, name: str) -> Iterator[dict[str, str]]:
    """Stream one table without materialising it (stop_times is ~2.3M rows)."""
    with zipfile.ZipFile(path) as archive:
        if name not in archive.namelist():
            return
        with archive.open(name) as handle:
            yield from csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig"))


def load(path: Path) -> tuple[dict[str, Rows], FeedInfo]:
    payload = path.read_bytes()
    return read_tables(path), parse_feed_info(payload)


def stale_after(info: FeedInfo, days: int = 7) -> bool:
    """True when the feed's service window ends within ``days``."""
    left = info.days_left()
    return left is not None and left <= days


def window_label(info: FeedInfo) -> str:
    left = info.days_left()
    if left is None:
        return "unknown window"
    if left < 0:
        return f"expired {abs(left)}d ago"
    return f"{left}d left"
