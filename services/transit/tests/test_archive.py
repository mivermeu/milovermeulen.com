"""Tests for archive layout, append behaviour and retention."""

from __future__ import annotations

import gzip
import json
import os
from pathlib import Path

from .. import archive

# 2026-10-26 01:32 UTC, matching the fixture capture session.
NOW = 1792978330.0
DAY = "2026-10-26"


def store(tmp_path: Path) -> archive.Archive:
    return archive.Archive(archive.ArchiveConfig(root=tmp_path))


def test_raw_is_byte_exact(tmp_path):
    archive_store = store(tmp_path)
    payload = b"\x01\x02\x03raw-protobuf"
    path = archive_store.write_raw("gtfs-g", payload, now=NOW)
    assert path.name.startswith("gtfs-g-")
    assert path.suffixes == [".pb", ".gz"]
    assert gzip.decompress(path.read_bytes()) == payload
    assert path.parent.parent.name == DAY


def test_invalid_payload_is_quarantined(tmp_path):
    archive_store = store(tmp_path)
    path = archive_store.write_bad("gtfs-g", b"<html>", "truncated varint", now=NOW)
    assert path.read_bytes() == b"<html>"
    assert "bad" in path.parts
    assert "truncated-varint" in path.name


def test_series_appends_rows_verbatim(tmp_path):
    archive_store = store(tmp_path)
    row = {
        "v": 1,
        "t": int(NOW),
        "id": "1G 2121",
        "trip": "128150_G..S",
        "start": "20261027",
        "route": "G",
        "dir": "E",
        "st": "STOPPED_AT",
        "stop": "G29S",
        "seq": 4,
        "feed": "gtfs-g",
        "vehicle_ts": int(NOW) - 5,
        "pattern": "G-abc",
        "edge": 3,
        "s": 812.5,
        "speed": 0.0,
        "conf": 0.9,
        "stale": False,
        "reset": False,
        "graph": "ae12",
        "next": [["G24S", 1792978300, 1792978320]],
    }
    assert archive_store.append_series([row], now=NOW) == 1
    later = {**row, "t": int(NOW + 60)}
    assert archive_store.append_series([later], now=NOW + 60) == 1

    path = tmp_path / "series" / f"{DAY}.jsonl.gz"
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        rows = [json.loads(line) for line in handle]
    assert len(rows) == 2
    assert rows[0] == row
    assert rows[1]["t"] == int(NOW + 60)


def test_events_are_written_to_their_own_tier(tmp_path):
    archive_store = store(tmp_path)
    event = {"v": 1, "kind": "arrive", "t_lo": 1, "t_hi": 2, "id": "1G"}
    assert archive_store.append_events([event], now=NOW) == 1

    path = tmp_path / "events" / f"{DAY}.jsonl.gz"
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        rows = [json.loads(line) for line in handle]
    assert rows == [event]


def test_events_are_never_pruned(tmp_path):
    archive_store = store(tmp_path)
    archive_store.append_events([{"v": 1, "kind": "arrive"}], now=NOW)
    path = tmp_path / "events" / f"{DAY}.jsonl.gz"
    os.utime(path, (NOW - 800 * 86400, NOW - 800 * 86400))

    archive_store.prune(now=NOW)

    assert path.exists()


def test_meta_outlives_the_series(tmp_path):
    archive_store = store(tmp_path)
    series = tmp_path / "series" / "2026-04-01.jsonl.gz"
    series.parent.mkdir(parents=True)
    series.write_bytes(b"")
    meta = tmp_path / "meta" / "2026-04-01.jsonl"
    meta.parent.mkdir(parents=True)
    meta.write_text("{}\n")
    old = NOW - 200 * 86400
    os.utime(series, (old, old))
    os.utime(meta, (old, old))

    archive_store.prune(now=NOW)

    assert not series.exists()
    assert meta.exists()


def test_series_handles_empty_snapshot(tmp_path):
    archive_store = store(tmp_path)
    assert archive_store.append_series([], now=NOW) == 0
    assert not (tmp_path / "series").exists()


def test_meta_is_one_row_per_cycle(tmp_path):
    archive_store = store(tmp_path)
    archive_store.append_meta({"t": int(NOW), "trains": 3}, now=NOW)
    archive_store.append_meta({"t": int(NOW) + 30, "trains": 4}, now=NOW + 30)
    path = tmp_path / "meta" / f"{DAY}.jsonl"
    rows = [json.loads(line) for line in path.read_text().splitlines()]
    assert [row["trains"] for row in rows] == [3, 4]


def test_prune_keeps_fresh_and_drops_old(tmp_path):
    archive_store = store(tmp_path)
    old_raw = archive_store.write_raw("gtfs-g", b"x", now=NOW - 72 * 3600)
    fresh_raw = archive_store.write_raw("gtfs-g", b"x", now=NOW)
    old_series = tmp_path / "series" / "2026-07-01.jsonl.gz"
    old_series.parent.mkdir(parents=True)
    old_series.write_bytes(b"")
    os.utime(old_raw, (NOW - 72 * 3600, NOW - 72 * 3600))
    os.utime(fresh_raw, (NOW, NOW))
    os.utime(old_series, (NOW - 200 * 86400, NOW - 200 * 86400))

    removed = archive_store.prune(now=NOW)

    assert removed == 2
    assert fresh_raw.exists()
    assert not old_raw.exists()
    assert not old_series.exists()


def test_prune_removes_empty_directories(tmp_path):
    archive_store = store(tmp_path)
    old_raw = archive_store.write_raw("gtfs-g", b"x", now=NOW - 72 * 3600)
    os.utime(old_raw, (NOW - 72 * 3600, NOW - 72 * 3600))
    archive_store.prune(now=NOW)
    assert not old_raw.parent.exists()
