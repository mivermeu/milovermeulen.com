"""Estimator: observation -> along-track position, reconciliation and continuity."""

from __future__ import annotations

from typing import Any

from .. import estimator, gtfs

GRAPH: dict[str, Any] = {
    "patterns": [
        {
            "id": "T-N",
            "route": "T",
            "dir": "N",
            "shape": "SH-N",
            "length_m": 1000.0,
            "stops": [["T1N", 0.0], ["T2N", 400.0], ["T3N", 700.0], ["T4N", 1000.0]],
        },
        {
            "id": "U-N",
            "route": "U",
            "dir": "N",
            "shape": "SH-U",
            "length_m": 300.0,
            "stops": [["U3N", 0.0], ["U4N", 300.0]],
        },
    ]
}


def build_feed(
    route: str = "T",
    trip_id: str = "TRIP-1",
    train_id: str = "1T 1200",
    stops: tuple[str, ...] = ("T1N", "T2N", "T3N", "T4N"),
    status: int = 1,
    stop_id: str = "T1N",
    timestamp: float = 1000.0,
) -> gtfs.Feed:
    update = gtfs.TripUpdate(
        trip=gtfs.TripDescriptor(trip_id=trip_id, route_id=route, train_id=train_id)
    )
    update.stop_time_updates = [
        gtfs.StopTimeUpdate(stop_id=stop, stop_sequence=index + 1)
        for index, stop in enumerate(stops)
    ]
    vehicle = gtfs.VehiclePosition(
        trip_id=trip_id,
        stop_id=stop_id,
        current_status=status,
        timestamp=int(timestamp),
    )
    return gtfs.Feed(trip_updates=[update], vehicles=[vehicle])


def make_estimator() -> estimator.Estimator:
    instance = estimator.Estimator()
    instance.set_graph(GRAPH, "hash")
    return instance


def test_stopped_at_places_train_on_the_stop():
    instance = make_estimator()
    positions = instance.update({"t": build_feed(status=1, stop_id="T2N")}, now=1000.0)
    position = positions["1T 1200"]
    assert position["pattern"] == "T-N"
    assert "T2N>" in position["edge"]
    assert position["s"] == 0.0


def test_in_transit_without_history_uses_the_segment_midpoint():
    instance = make_estimator()
    positions = instance.update({"t": build_feed(status=2, stop_id="T2N")}, now=1000.0)
    position = positions["1T 1200"]
    assert "T1N>T2N" in position["edge"]
    assert position["s"] == 200.0


def test_successive_observations_move_forward_without_a_jump():
    instance = make_estimator()
    instance.update({"t": build_feed(status=1, stop_id="T1N", timestamp=1000)}, now=1000.0)
    positions = instance.update(
        {"t": build_feed(status=2, stop_id="T2N", timestamp=1030)}, now=1030.0
    )
    position = positions["1T 1200"]
    assert position["s"] > 150  # moved towards T2N, not teleported to it
    assert 0 < position["v"] <= estimator.MAX_SPEED_MPS
    assert position["confidence"] > 0.5


def test_large_error_re_anchors_instead_of_crawling():
    instance = make_estimator()
    instance.update({"t": build_feed(status=1, stop_id="T1N", timestamp=1000)}, now=1000.0)
    # 1000 m in 2 s is not physically possible for any train, so this is a reset.
    positions = instance.update(
        {"t": build_feed(status=1, stop_id="T4N", timestamp=1002)}, now=1002.0
    )
    position = positions["1T 1200"]
    assert "T3N>T4N" in position["edge"]
    assert position["s"] == 300.0  # the last real edge, at its far end
    assert position["reset"] is True


def test_stale_vehicle_lowers_confidence():
    instance = make_estimator()
    positions = instance.update(
        {"t": build_feed(status=1, stop_id="T2N", timestamp=800)}, now=1000.0
    )
    position = positions["1T 1200"]
    assert position["stale"] is True
    assert position["confidence"] <= 0.5


def test_short_turn_keeps_the_same_train():
    instance = make_estimator()
    first = instance.update({"t": build_feed(status=1, stop_id="T3N")}, now=1000.0)
    assert "1T 1200" in first

    short_turn = build_feed(
        route="U",
        trip_id="TRIP-2",
        stops=("U3N", "U4N"),
        status=1,
        stop_id="U3N",
        timestamp=1030,
    )
    second = instance.update({"t": short_turn}, now=1030.0)
    position = second["1T 1200"]
    assert position["pattern"] == "U-N"
    assert position["s"] == 0.0
    assert position["v"] == 0.0


def test_unmatched_route_yields_no_position():
    instance = make_estimator()
    positions = instance.update({"t": build_feed(route="Z")}, now=1000.0)
    assert positions == {}
    assert instance.unmatched == 1


def test_without_a_graph_nothing_is_estimated():
    instance = estimator.Estimator()
    assert instance.update({"t": build_feed()}, now=1000.0) == {}


def test_state_is_dropped_after_the_grace_window():
    instance = make_estimator()
    instance.update({"t": build_feed()}, now=1000.0)
    assert instance.states
    instance.update({"t": gtfs.Feed()}, now=1000.0 + 4 * estimator.STALE_S + 1)
    assert not instance.states


def test_a_correction_cannot_exceed_physical_speed():
    instance = make_estimator()
    instance.update({"t": build_feed(status=1, stop_id="T1N", timestamp=1000)}, now=1000.0)
    positions = instance.update(
        {"t": build_feed(status=1, stop_id="T2N", timestamp=1005)}, now=1005.0
    )
    # 400 m in 5 s would be 80 m/s; the cap holds it to 30 m/s (150 m).
    assert positions["1T 1200"]["s"] <= estimator.MAX_SPEED_MPS * 5 + 1


def test_a_normal_one_stop_advance_is_not_a_reset():
    instance = make_estimator()
    instance.update({"t": build_feed(status=1, stop_id="T1N", timestamp=1000)}, now=1000.0)
    positions = instance.update(
        {"t": build_feed(status=1, stop_id="T2N", timestamp=1035)}, now=1035.0
    )
    position = positions["1T 1200"]
    assert position["reset"] is False
    assert position["confidence"] > 0.9


def test_a_stopped_train_reports_zero_speed():
    instance = make_estimator()
    instance.update({"t": build_feed(status=1, stop_id="T1N", timestamp=1000)}, now=1000.0)
    positions = instance.update(
        {"t": build_feed(status=1, stop_id="T2N", timestamp=1035)}, now=1035.0
    )
    assert positions["1T 1200"]["v"] == 0.0


def test_in_transit_advances_towards_the_eta():
    instance = make_estimator()
    update = build_feed(status=2, stop_id="T2N", timestamp=1000)
    instance.update({"t": update}, now=1000.0)

    later = build_feed(status=2, stop_id="T2N", timestamp=1010)
    later.trip_updates[0].stop_time_updates[1].arrival = gtfs.StopTimeEvent(time=1040)
    positions = instance.update({"t": later}, now=1010.0)
    # The train was at the midpoint (200 m); the ETA implies forward motion, and
    # the position must advance without jumping to the end of the segment.
    assert 200 < positions["1T 1200"]["s"] <= 400


def test_duplicate_train_ids_are_counted_not_shared():
    instance = make_estimator()
    first = build_feed(route="T", trip_id="TRIP-1", train_id="DUP")
    second = build_feed(
        route="U", trip_id="TRIP-2", train_id="DUP", stops=("U3N", "U4N"), stop_id="U3N"
    )
    positions = instance.update({"a": first, "b": second}, now=1000.0)
    assert len(positions) == 1
    assert instance.duplicates == 1


def test_trains_without_a_vehicle_are_skipped():
    instance = make_estimator()
    update = build_feed(status=1, stop_id="T1N", timestamp=1000)
    update.vehicles = []
    assert instance.update({"t": update}, now=1000.0) == {}
    assert instance.without_vehicle == 1
