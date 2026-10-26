"""Tests for one poll cycle: archive, snapshot, metadata, failure handling."""

from __future__ import annotations

import gzip
import json
from pathlib import Path

from .. import estimator, feeds, gtfs
from ..poller import Config, Poller
from .wire import feed as build_feed

FIXTURES = Path(__file__).parent / "fixtures"
NOW = 1792978330.0


def fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def mapping_ok() -> dict[str, tuple]:
    mapping: dict[str, tuple] = {name: (200, build_feed([]), None, 4) for name in feeds.TRIP_FEEDS}
    mapping["gtfs-g"] = (200, fixture("gtfs-g.pb"), None, 12)
    mapping["gtfs-si"] = (200, fixture("gtfs-si.pb"), None, 9)
    mapping[feeds.ALERTS_FEED] = (200, fixture("alerts.pb"), None, 20)
    return mapping


def poller_for(tmp_path: Path, mapping: dict[str, tuple]) -> Poller:
    def fake_fetch(names: tuple[str, ...], timeout: float = 10.0) -> dict[str, feeds.FetchResult]:
        return {
            name: feeds.FetchResult(name, *mapping.get(name, (200, None, "missing", 0)))
            for name in names
        }

    config = Config(data_dir=tmp_path / "data", www_dir=tmp_path / "www")
    config.series_every = 1
    return Poller(config, fetcher=fake_fetch, clock=lambda: NOW)


def test_tick_publishes_snapshot(tmp_path):
    document = poller_for(tmp_path, mapping_ok()).tick()

    path = tmp_path / "www" / "snapshot.json"
    assert path.exists()
    saved = json.loads(path.read_text())
    assert saved == document
    assert saved["v"] == 1
    # gtfs-g contributes 20 trains, gtfs-si 7; the other feeds are empty.
    assert len(saved["trains"]) == 27
    assert saved["alerts"]
    assert saved["feeds"]["gtfs-g"]["ok"] is True


def test_tick_archives_every_feed(tmp_path):
    poller_for(tmp_path, mapping_ok()).tick()

    raw = list((tmp_path / "data" / "raw").rglob("*.pb.gz"))
    assert len(raw) == len(feeds.FEED_NAMES)
    archived = {path.name.rsplit("-", 1)[0] for path in raw}
    assert "gtfs-g" in archived
    assert feeds.ALERTS_FEED in archived


def test_tick_writes_series_and_meta(tmp_path):
    document = poller_for(tmp_path, mapping_ok()).tick()

    with gzip.open(next((tmp_path / "data" / "series").glob("*.jsonl.gz")), "rt") as handle:
        rows = [json.loads(line) for line in handle]
    assert len(rows) == len(document["trains"])

    meta = next((tmp_path / "data" / "meta").glob("*.jsonl"))
    record = json.loads(meta.read_text().splitlines()[0])
    assert record["trains"] == len(document["trains"])
    assert record["failed"] == []


def test_invalid_payload_is_quarantined_but_cycle_continues(tmp_path):
    mapping = mapping_ok()
    mapping["gtfs-g"] = (200, b"<html>not a feed</html>", None, 5)

    document = poller_for(tmp_path, mapping).tick()

    bad = list((tmp_path / "data" / "bad").rglob("*.pb"))
    assert bad, "invalid payload should be kept for reproduction"
    assert document["feeds"]["gtfs-g"]["ok"] is False
    assert "invalid feed" in document["feeds"]["gtfs-g"]["error"]
    assert document["trains"], "other feeds should still populate the snapshot"


def test_http_failure_is_reported_without_archiving(tmp_path):
    mapping = mapping_ok()
    mapping["gtfs-l"] = (500, None, "http 500", 30)

    document = poller_for(tmp_path, mapping).tick()

    assert document["feeds"]["gtfs-l"]["ok"] is False
    assert document["feeds"]["gtfs-l"]["status"] == 500
    names = {path.name.rsplit("-", 1)[0] for path in (tmp_path / "data" / "raw").rglob("*.pb.gz")}
    assert "gtfs-l" not in names


def test_snapshot_write_leaves_no_temporary_file(tmp_path):
    poller_for(tmp_path, mapping_ok()).tick()
    assert not list((tmp_path / "www").glob("*.tmp"))


def test_age_is_derived_from_feed_header(tmp_path):
    document = poller_for(tmp_path, mapping_ok()).tick()
    # Fixture headers are a few seconds before NOW.
    assert document["feeds"]["gtfs-g"]["age_s"] is not None
    assert 0 <= document["feeds"]["gtfs-g"]["age_s"] < 120


def test_differential_feed_is_quarantined(tmp_path):
    mapping = mapping_ok()
    mapping["gtfs-g"] = (200, build_feed([], incrementality=1), None, 5)

    document = poller_for(tmp_path, mapping).tick()

    assert document["feeds"]["gtfs-g"]["ok"] is False
    assert "incrementality" in document["feeds"]["gtfs-g"]["error"]
    assert len(document["trains"]) == 7


def test_snapshot_carries_positions_when_a_graph_is_published(tmp_path):
    feed = gtfs.parse_feed(fixture("gtfs-g.pb"))
    trip = next(update for update in feed.trip_updates if len(update.stop_time_updates) > 4)
    stops = [stop.stop_id for stop in trip.stop_time_updates]
    pattern = {
        "id": "G-TEST",
        "route": "G",
        "dir": gtfs.trip_direction(trip.trip),
        "shape": "SH-TEST",
        "length_m": float((len(stops) - 1) * 500),
        "stops": [[stop, index * 500.0] for index, stop in enumerate(stops)],
    }
    www = tmp_path / "www"
    www.mkdir(parents=True)
    (www / "graph-test.json").write_text(json.dumps({"patterns": [pattern]}))
    (www / "graph.json").write_text(
        json.dumps({"hash": "test", "graph": "graph-test.json", "shapes": "shapes-test.bin"})
    )

    document = poller_for(tmp_path, mapping_ok()).tick()

    assert document["graph"] == "test"
    assert document["estimated"] > 0
    estimated = [train for train in document["trains"] if train["edge"]]
    assert estimated
    assert estimated[0]["pattern"] == "G-TEST"
    assert estimated[0]["s"] >= 0


def test_estimator_failure_still_publishes_a_snapshot(tmp_path, monkeypatch):
    poller = poller_for(tmp_path, mapping_ok())
    poller.estimator.index = object()  # pretend a graph is loaded

    def explode(*_args: object, **_kwargs: object) -> dict:
        raise RuntimeError("boom")

    monkeypatch.setattr(estimator.Estimator, "update", explode)
    document = poller.tick()

    assert document["trains"]
    assert document["estimated"] == 0
    assert (tmp_path / "www" / "snapshot.json").exists()
