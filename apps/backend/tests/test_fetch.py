"""Tests for the TLE fetcher module."""

from __future__ import annotations

import json
import os
import tempfile
import time
from pathlib import Path

from ..fetch import (
    DECAY_REFRESH_INTERVAL_S,
    SPACETRACK_DECAY_FULL_URL,
    SPACETRACK_DECAY_RECENT_URL,
    TleRecord,
    drop_decayed,
    load_decay_ids,
    load_existing,
    merge_tles,
    norad_id,
    parse_decay_ids,
    parse_tle_text,
    refresh_decay_ids,
    save_decay_ids,
    save_json,
)

SAMPLE_TLE = """\
ISS (ZARYA)
1 25544U 98067A   24001.50000000  .00000000  00000-0  00000-0 0  9990
2 25544  51.6400 200.0000 0005000 100.0000 260.0000 15.49000000400000
TIANGONG
1 41765U 21035A   24001.50000000  .00000000  00000-0  00000-0 0  9990
2 41765  41.4700 200.0000 0006000 100.0000 260.0000 15.50000000100000
HUBBLE
1 20580U 90037B   24001.50000000  .00000000  00000-0  00000-0 0  9990
2 20580  28.4700 200.0000 0002000 100.0000 260.0000 15.09000000100000
"""


def test_parse_single_satellite() -> None:
    text = (
        "ISS (ZARYA)\n"
        "1 25544U 98067A   24001.50000000  .00000000  00000-0  00000-0 0  9990\n"
        "2 25544  51.6400 200.0000 0005000 100.0000 260.0000 15.49000000400000\n"
    )
    result = parse_tle_text(text)
    assert len(result) == 1
    assert result[0]["name"] == "ISS (ZARYA)"
    assert result[0]["line1"].startswith("1 25544")
    assert result[0]["line2"].startswith("2 25544")


def test_parse_multiple_satellites() -> None:
    result = parse_tle_text(SAMPLE_TLE)
    assert len(result) == 3
    names = [s["name"] for s in result]
    assert "ISS (ZARYA)" in names
    assert "TIANGONG" in names
    assert "HUBBLE" in names


def test_parse_empty_input() -> None:
    assert parse_tle_text("") == []
    assert parse_tle_text("no TLE data here") == []


def test_parse_malformed_entries() -> None:
    text = (
        "SOME HEADER\n"
        "1 25544U 98067A   24001.50000000  .00000000  00000-0  00000-0 0  9990\n"
        "BAD LINE\n"
        "1 20580U 90037B   24001.50000000  .00000000  00000-0  00000-0 0  9990\n"
        "2 20580  28.4700 200.0000 0002000 100.0000 260.0000 15.09000000100000\n"
    )
    result = parse_tle_text(text)
    # First sat has bad line2, second sat should still parse
    assert len(result) >= 1


def test_merge_tles_new_entries() -> None:
    existing: dict[str, TleRecord] = {"ISS": {"name": "ISS", "line1": "old1", "line2": "old2"}}
    new: list[TleRecord] = [{"name": "TIANGONG", "line1": "new1", "line2": "new2"}]
    merged = merge_tles(existing, new)
    assert len(merged) == 2
    assert merged["ISS"]["line1"] == "old1"
    assert merged["TIANGONG"]["line1"] == "new1"


def test_merge_tles_overwrites_existing() -> None:
    existing: dict[str, TleRecord] = {"ISS": {"name": "ISS", "line1": "old1", "line2": "old2"}}
    new: list[TleRecord] = [{"name": "ISS", "line1": "new1", "line2": "new2"}]
    merged = merge_tles(existing, new)
    assert len(merged) == 1
    assert merged["ISS"]["line1"] == "new1"


def test_merge_tles_empty() -> None:
    assert merge_tles({}, []) == {}
    assert merge_tles({"A": {"name": "A", "line1": "", "line2": ""}}, []) == {
        "A": {"name": "A", "line1": "", "line2": ""}
    }


def test_load_existing_empty() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "tles.json"
        assert load_existing(path) == {}


def test_load_existing_valid() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "tles.json"
        data: list[TleRecord] = [{"name": "ISS", "line1": "1 25544U", "line2": "2 25544"}]
        path.write_text(json.dumps(data))
        result = load_existing(path)
        assert "ISS" in result
        assert result["ISS"]["line1"] == "1 25544U"


def test_load_existing_corrupt() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "tles.json"
        path.write_text("not json{{{")
        assert load_existing(path) == {}


def test_save_json_atomic() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "tles.json"
        data: list[TleRecord] = [{"name": "ISS", "line1": "1 25544U", "line2": "2 25544"}]
        save_json(data, path)
        assert path.exists()
        loaded = json.loads(path.read_text())
        assert len(loaded) == 1
        # Temp file should not exist
        assert not path.with_suffix(".json.tmp").exists()


def test_norad_id() -> None:
    assert norad_id("1 68319U 26058A   26241.65974551  .00005709  00000-0  11198-3 0  9999") == "68319"
    assert norad_id("1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9990") == "25544"
    assert norad_id("1 A0000U 25001A   26250.50000000  .00000000  00000-0  00000-0 0  9991") == "100000"
    assert norad_id("1 E8493U 25001A   26250.50000000  .00000000  00000-0  00000-0 0  9991") == "148493"
    assert norad_id("nope") is None
    assert norad_id(None) is None  # type: ignore[arg-type]


def test_parse_decay_ids() -> None:
    records = [
        {"NORAD_CAT_ID": 68319, "MSG_EPOCH": "2026-09-01", "DECAY_EPOCH": "2026-09-01"},
        {"NORAD_CAT_ID": "25544"},
        {"nope": True},
        {"NORAD_CAT_ID": None},
    ]
    assert parse_decay_ids(records) == {"68319", "25544"}


def test_decay_ids_roundtrip() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "decayed-ids.json"
        assert load_decay_ids(path) == set()
        save_decay_ids(path, {"68319", "25544"})
        assert load_decay_ids(path) == {"68319", "25544"}
        path.write_text("corrupt{{{")
        assert load_decay_ids(path) == set()


def test_drop_decayed() -> None:
    merged: dict[str, TleRecord] = {
        "MS-33": {
            "name": "MS-33",
            "line1": "1 68319U 26058A   26241.65974551  .00005709  00000-0  11198-3 0  9999",
            "line2": "2 68319",
        },
        "ISS": {
            "name": "ISS",
            "line1": "1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9990",
            "line2": "2 25544",
        },
        "JUNK": {"name": "JUNK", "line1": "nope", "line2": "nope"},
    }
    kept, dropped = drop_decayed(merged, {"68319"})
    assert list(kept) == ["ISS", "JUNK"]
    assert dropped == 1


def backdate(path: Path, seconds_old: float) -> None:
    old = time.time() - seconds_old
    os.utime(path, (old, old))


def test_refresh_decay_ids_bootstraps_then_incremental() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "decayed-ids.json"
        calls: list[str] = []

        def stub_fetch(opener: object, url: str) -> set[str]:
            calls.append(url)
            return {"68319"}

        assert refresh_decay_ids(None, path, fetch=stub_fetch) == {"68319"}  # type: ignore[arg-type]
        assert calls == [SPACETRACK_DECAY_FULL_URL]

        save_decay_ids(path, {"11111"})
        backdate(path, DECAY_REFRESH_INTERVAL_S + 3600)
        assert refresh_decay_ids(None, path, fetch=stub_fetch) == {"11111", "68319"}  # type: ignore[arg-type]
        assert calls[1:] == [SPACETRACK_DECAY_RECENT_URL]
        assert load_decay_ids(path) == {"11111", "68319"}


def test_refresh_decay_ids_skips_when_fresh() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "decayed-ids.json"
        save_decay_ids(path, {"11111"})

        def stub_boom(opener: object, url: str) -> set[str]:
            raise AssertionError("must not fetch")

        assert refresh_decay_ids(None, path, fetch=stub_boom) == {"11111"}  # type: ignore[arg-type]


def test_refresh_decay_ids_fetch_failure_keeps_stored() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "decayed-ids.json"
        save_decay_ids(path, {"11111"})
        backdate(path, DECAY_REFRESH_INTERVAL_S + 3600)

        def stub_fail(opener: object, url: str) -> None:
            return None

        assert refresh_decay_ids(None, path, fetch=stub_fail) == {"11111"}  # type: ignore[arg-type]
