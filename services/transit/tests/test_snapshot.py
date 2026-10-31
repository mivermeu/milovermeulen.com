"""Tests for the served snapshot shape (schema v1)."""

from __future__ import annotations

from pathlib import Path

from .. import gtfs, snapshot

FIXTURES = Path(__file__).parent / "fixtures"


def feed(name: str) -> gtfs.Feed:
    return gtfs.parse_feed((FIXTURES / name).read_bytes())


def build_snapshot() -> dict:
    health = {
        "gtfs-g": {"ok": True, "status": 200, "age_s": 3, "trips": 20, "vehicles": 20},
        "subway-alerts": {"ok": True, "status": 200, "age_s": 3, "alerts": 3},
    }
    return snapshot.build(
        {"gtfs-g": feed("gtfs-g.pb")},
        feed("alerts.pb"),
        health,
        now=1792978330.0,
    )


def test_identity_and_stamp():
    document = build_snapshot()
    assert document["v"] == 1
    assert document["generated_at"] == 1792978330
    assert document["header_ts"] is not None


def test_every_trip_becomes_a_train():
    document = build_snapshot()
    assert len(document["trains"]) == 20
    for train in document["trains"]:
        assert train["trip"]
        assert train["route"] == "G"
        assert train["id"]
        assert len(train["next"]) <= snapshot.MAX_NEXT_STOPS


def test_vehicle_join_supplies_status():
    document = build_snapshot()
    with_status = [train for train in document["trains"] if train["status"]]
    assert with_status, "at least one train should join to a vehicle entity"
    train = with_status[0]
    assert train["status"] in {"INCOMING_AT", "STOPPED_AT", "IN_TRANSIT_TO"}
    assert train["stop"]
    assert train["vehicle_ts"]


def test_next_stops_carry_absolute_times():
    document = build_snapshot()
    with_next = [train for train in document["trains"] if train["next"]]
    assert with_next
    entry = with_next[0]["next"][0]
    assert entry["stop"]
    assert entry["arr"] or entry["dep"]


def test_alerts_are_merged():
    document = build_snapshot()
    assert len(document["alerts"]) == 3
    alert = document["alerts"][0]
    assert alert["id"]
    assert alert["routes"] == ["F"]


def test_health_is_passed_through():
    document = build_snapshot()
    assert document["feeds"]["gtfs-g"]["ok"] is True
    assert document["feeds"]["subway-alerts"]["alerts"] == 3


def test_direction_survives_missing_nyct_field():
    document = build_snapshot()
    by_trip = {train["trip"]: train["dir"] for train in document["trains"]}
    assert by_trip["128150_G..S15X004"] == "S"
    northbound = [train for train in document["trains"] if "..N" in (train["trip"] or "")]
    assert northbound, "fixture should contain northbound trips"
    assert all(train["dir"] == "N" for train in northbound)


def test_unassigned_trips_are_counted_not_rendered():
    source = feed("gtfs-g.pb")
    source.vehicles = []
    document = snapshot.build({"gtfs-g": source}, None, {}, now=1.0)
    assert document["trains"] == []
    assert document["scheduled_trips"] == 20
    assert document["alerts"] == []


def test_assigned_trips_are_not_double_counted():
    document = build_snapshot()
    assert document["scheduled_trips"] == 0


def test_positions_are_merged_by_train_id():
    document = snapshot.build(
        {"gtfs-g": feed("gtfs-g.pb")},
        None,
        {},
        now=1.0,
        positions={
            "1G 2121+ CRS/BDN": {
                "pattern": "G-N",
                "edge": "G-N:3:G29S>G30S",
                "s": 42.5,
                "v": 11.0,
                "confidence": 0.9,
                "stale": False,
            }
        },
    )
    estimated = [train for train in document["trains"] if train["edge"]]
    assert len(estimated) == 1
    assert estimated[0]["s"] == 42.5
    assert document["estimated"] == 1
    plain = [train for train in document["trains"] if not train["edge"]]
    assert plain and plain[0]["confidence"] == 0.0


def test_placeholders_keep_the_compat_status_and_are_counted():
    document = build_snapshot()
    pre = [train for train in document["trains"] if train["pre"]]
    assert pre, "the fixture contains placeholder vehicles"
    assert all(train["status"] == "IN_TRANSIT_TO" for train in pre)
    assert document["predeparture"] == len(pre)
    assert any(not train["pre"] for train in document["trains"])
