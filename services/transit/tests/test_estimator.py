"""Estimator: station events -> a time-parameterised position and a timeline."""

from __future__ import annotations

from typing import Any

from .. import estimator, gtfs

GRAPH: dict[str, Any] = {
    "v": 2,
    "patterns": [
        {
            "id": "T-N",
            "route": "T",
            "dir": "N",
            "shape": "SH-N",
            "length_m": 1000.0,
            "stops": [["T1N", 0.0], ["T2N", 400.0], ["T3N", 700.0], ["T4N", 1000.0]],
            "edge_times": [[60.0, 10.0], [40.0, 10.0], [50.0, 10.0]],
        },
        {
            "id": "U-N",
            "route": "U",
            "dir": "N",
            "shape": "SH-U",
            "length_m": 300.0,
            "stops": [["U3N", 0.0], ["U4N", 300.0]],
            "edge_times": [[50.0, 5.0]],
        },
    ],
}


def build_feed(
    route: str = "T",
    trip_id: str = "TRIP-1",
    train_id: str = "1T 1200",
    stops: tuple[str, ...] = ("T1N", "T2N", "T3N", "T4N"),
    status: int | None = 1,
    stop_id: str = "T1N",
    timestamp: float = 1000.0,
    seq: int | None = 1,
    arrival: float | None = None,
) -> gtfs.Feed:
    update = gtfs.TripUpdate(
        trip=gtfs.TripDescriptor(trip_id=trip_id, route_id=route, train_id=train_id)
    )
    update.stop_time_updates = [
        gtfs.StopTimeUpdate(stop_id=stop, stop_sequence=index + 1)
        for index, stop in enumerate(stops)
    ]
    if arrival is not None:
        update.stop_time_updates[1].arrival = gtfs.StopTimeEvent(time=arrival)
    vehicle = gtfs.VehiclePosition(
        trip_id=trip_id,
        stop_id=stop_id,
        current_stop_sequence=seq,
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
    position = instance.update({"t": build_feed(status=1, stop_id="T2N")}, now=1000.0)["1T 1200"]
    assert position["pattern"] == "T-N"
    assert "T2N>T3N" in position["edge"]
    assert position["s"] == 0.0
    assert position["s_total"] == 400.0
    assert position["v"] == 0.0


def test_dwelling_train_reports_a_future_departure():
    instance = make_estimator()
    position = instance.update({"t": build_feed(status=1, stop_id="T2N")}, now=1000.0)["1T 1200"]
    assert position["depart_at"] == 1010  # schedule dwell at T2N


def test_position_advances_after_dwell_without_a_new_observation():
    instance = make_estimator()
    instance.update({"t": build_feed(status=1, stop_id="T2N")}, now=1000.0)
    # Still within the 10 s dwell.
    edge, s, speed, depart = instance._place("T-N", 1, 1010.0, 1005.0)
    assert (edge, s, speed, depart) == (1, 0.0, 0.0, 1010.0)
    # Half-way through the 60 s run to T3N: the simulator must have moved even
    # though the feed said nothing new.
    edge, s, speed, depart = instance._place("T-N", 1, 1010.0, 1040.0)
    assert edge == 1
    assert depart == 1010.0
    assert 150 < s < 250
    assert speed > 0


def test_scheduled_run_is_used_instead_of_a_global_cruise_speed():
    instance = make_estimator()
    # 400 m in 60 s, not 400 m / 12 m/s = 33 s.
    assert instance._run_seconds("T-N", 0, 1000.0, 400.0) == 60.0


def test_learned_and_hour_adjusted_prior_wins_over_the_schedule():
    instance = make_estimator()
    instance.set_runtime(
        {
            "graph": "hash",
            "edges": {"T-N": [[120.0, 80], [None, 0], [None, 0]]},
            "hour_factor": [[1.0] * 24, [1.0] * 24],
        }
    )
    assert instance._run_seconds("T-N", 0, 1000.0, 400.0) == 120.0

    instance.runtime["hour_factor"] = [[1.2] * 24, [1.0] * 24]
    assert instance._run_seconds("T-N", 0, 1000.0, 400.0) == 144.0


def test_a_stale_runtime_for_another_graph_is_ignored():
    instance = make_estimator()
    instance.set_runtime({"graph": "other", "edges": {"T-N": [[120.0, 80]]}})
    assert instance.runtime is None
    assert instance._run_seconds("T-N", 0, 1000.0, 400.0) == 60.0


def test_in_transit_without_an_eta_uses_the_segment_midpoint():
    instance = make_estimator()
    position = instance.update({"t": build_feed(status=2, stop_id="T2N")}, now=1000.0)["1T 1200"]
    assert "T1N>T2N" in position["edge"]
    assert 150 < position["s"] < 250


def test_in_transit_with_an_eta_places_by_remaining_time():
    instance = make_estimator()
    # 40 s to T2N on a 60 s edge: the train is about a third of the way along.
    position = instance.update(
        {"t": build_feed(status=2, stop_id="T2N", arrival=1040)}, now=1000.0
    )["1T 1200"]
    assert "T1N>T2N" in position["edge"]
    assert 80 < position["s"] < 200


def test_next_is_a_future_monotone_timeline():
    instance = make_estimator()
    position = instance.update({"t": build_feed(status=1, stop_id="T2N")}, now=1000.0)["1T 1200"]
    plan = position["next"]
    assert [row["stop"] for row in plan] == ["T3N", "T4N"]
    assert plan[0]["arr"] >= 1000
    assert plan[0]["dep"] >= plan[0]["arr"]
    assert plan[1]["arr"] >= plan[0]["dep"]


def test_a_normal_one_stop_advance_is_not_a_reset():
    instance = make_estimator()
    instance.update({"t": build_feed(status=1, stop_id="T1N", timestamp=1000)}, now=1000.0)
    position = instance.update(
        {"t": build_feed(status=1, stop_id="T2N", timestamp=1035)}, now=1035.0
    )["1T 1200"]
    assert position["reset"] is False
    assert position["confidence"] > 0.9


def test_a_large_jump_re_anchors_and_flags_a_reset():
    instance = make_estimator()
    instance.update({"t": build_feed(status=1, stop_id="T1N", timestamp=1000)}, now=1000.0)
    position = instance.update(
        {"t": build_feed(status=1, stop_id="T4N", timestamp=1002)}, now=1002.0
    )["1T 1200"]
    assert "T3N>T4N" in position["edge"]
    assert position["s"] == 300.0
    assert position["reset"] is True


def test_a_terminal_observation_stays_at_the_end():
    instance = make_estimator()
    position = instance.update({"t": build_feed(status=1, stop_id="T4N")}, now=1000.0)["1T 1200"]
    assert position["s_total"] == 1000.0
    assert position["next"] == []


def test_stale_vehicle_lowers_confidence_and_grows_uncertainty():
    instance = make_estimator()
    fresh = instance.update(
        {"t": build_feed(status=1, stop_id="T2N", timestamp=1000)}, now=1000.0
    )["1T 1200"]
    stale = make_estimator().update(
        {"t": build_feed(status=1, stop_id="T2N", timestamp=800)}, now=1000.0
    )["1T 1200"]
    assert stale["stale"] is True
    assert stale["confidence"] <= fresh["confidence"]
    assert stale["sigma"] > fresh["sigma"]


def test_short_turn_keeps_the_same_train():
    instance = make_estimator()
    assert "1T 1200" in instance.update(
        {"t": build_feed(status=1, stop_id="T3N")}, now=1000.0
    )
    short_turn = build_feed(
        route="U",
        trip_id="TRIP-2",
        stops=("U3N", "U4N"),
        status=1,
        stop_id="U3N",
        timestamp=1030,
    )
    position = instance.update({"t": short_turn}, now=1030.0)["1T 1200"]
    assert position["pattern"] == "U-N"
    assert position["s_total"] == 0.0
    assert position["reset"] is False


def test_unmatched_route_yields_no_position():
    instance = make_estimator()
    assert instance.update({"t": build_feed(route="Z")}, now=1000.0) == {}
    assert instance.unmatched == 1


def test_without_a_graph_nothing_is_estimated():
    assert estimator.Estimator().update({"t": build_feed()}, now=1000.0) == {}


def test_state_is_dropped_after_the_grace_window():
    instance = make_estimator()
    instance.update({"t": build_feed()}, now=1000.0)
    assert instance.states
    instance.update({"t": gtfs.Feed()}, now=1000.0 + 4 * estimator.STALE_S + 1)
    assert not instance.states


def test_duplicate_train_ids_are_counted_not_shared():
    instance = make_estimator()
    first = build_feed(route="T", trip_id="TRIP-1", train_id="DUP")
    second = build_feed(
        route="U", trip_id="TRIP-2", train_id="DUP", stops=("U3N", "U4N"), stop_id="U3N"
    )
    assert len(instance.update({"a": first, "b": second}, now=1000.0)) == 1
    assert instance.duplicates == 1


def test_trains_without_a_vehicle_are_skipped():
    instance = make_estimator()
    update = build_feed()
    update.vehicles = []
    assert instance.update({"t": update}, now=1000.0) == {}
    assert instance.without_vehicle == 1


def test_placeholders_are_skipped_and_counted():
    instance = make_estimator()
    assert instance.update({"t": build_feed(status=None, seq=None)}, now=1000.0) == {}
    assert instance.placeholders == 1
    assert instance.observed == 1


def test_a_sequence_without_a_status_is_still_observed():
    instance = make_estimator()
    positions = instance.update(
        {"t": build_feed(status=None, seq=3, stop_id="T2N")}, now=1000.0
    )
    assert instance.placeholders == 0
    assert positions


def test_profile_is_continuous_and_bounded():
    for run in (30.0, 60.0, 180.0):
        previous = 0.0
        for step in range(0, 101):
            fraction, speed = estimator.profile(run * step / 100, run)
            assert 0.0 <= fraction <= 1.0
            assert fraction >= previous - 1e-9
            assert speed >= 0.0
            previous = fraction
        assert estimator.profile(run, run) == (1.0, 0.0)
        assert estimator.profile(0.0, run) == (0.0, 0.0)


def test_station_to_station_sequence_never_jumps():
    """The no-teleport invariant across a normal four-stop run."""
    instance = make_estimator()
    previous = None
    for index, stop in enumerate(("T1N", "T2N", "T3N", "T4N")):
        now = 1000.0 + index * 60
        position = instance.update(
            {"t": build_feed(status=1, stop_id=stop, timestamp=now, seq=index + 1)}, now=now
        )["1T 1200"]
        if previous is not None:
            step = position["s_total"] - previous["s_total"]
            assert step <= estimator.MAX_SPEED_MPS * 60 + 1
            assert step >= -1  # never backwards on a forward run
        previous = position


def test_the_timeline_agrees_with_the_position_at_the_snapshot_instant():
    instance = make_estimator()
    position = instance.update(
        {"t": build_feed(status=1, stop_id="T2N", timestamp=1000, arrival=1090)}, now=1030.0
    )["1T 1200"]
    plan = position["next"]
    # The first planned arrival must be in the future relative to generated_at.
    assert plan[0]["arr"] >= 1030
    assert position["depart_at"] >= 1000
