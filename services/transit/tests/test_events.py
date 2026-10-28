"""Event tracker: transitions, brackets, gaps and abnormal endings."""

from __future__ import annotations

from .. import events, gtfs

IN_TRANSIT = 2
STOPPED = 1


def feed(
    trip: str = "T1",
    start: str = "20261027",
    stop: str | None = "X",
    seq: int = 1,
    status: int = IN_TRANSIT,
    timestamp: int = 1000,
    train: str = "1T",
    relationship: int | None = None,
    predictions: tuple[tuple[str, int], ...] = (("X", 5000), ("Y", 5060), ("Z", 5120)),
) -> gtfs.Feed:
    update = gtfs.TripUpdate(
        trip=gtfs.TripDescriptor(
            trip_id=trip,
            route_id="T",
            start_date=start,
            train_id=train,
            schedule_relationship=relationship,
        )
    )
    update.stop_time_updates = [
        gtfs.StopTimeUpdate(
            stop_id=value,
            stop_sequence=index + 1,
            arrival=gtfs.StopTimeEvent(time=when),
        )
        for index, (value, when) in enumerate(predictions)
    ]
    vehicle = gtfs.VehiclePosition(
        trip_id=trip,
        stop_id=stop,
        current_stop_sequence=seq,
        current_status=status,
        timestamp=timestamp,
    )
    return gtfs.Feed(trip_updates=[update], vehicles=[vehicle])


def kinds(rows: list[dict]) -> list[tuple[str, str | None, str]]:
    return [(row["kind"], row["stop"], row["source"]) for row in rows]


def test_first_cycle_emits_nothing():
    tracker = events.EventTracker()
    assert tracker.observe({"f": feed()}, {}, now=0.0, first_cycle=True) == []


def test_arrival_from_status_uses_the_previous_prediction():
    tracker = events.EventTracker()
    tracker.observe({"f": feed(status=IN_TRANSIT, stop="X", seq=1)}, {}, now=0.0)
    rows = tracker.observe({"f": feed(status=STOPPED, stop="X", seq=1)}, {}, now=30.0)
    assert kinds(rows) == [("arrive", "X", "status")]
    assert rows[0]["predicted_at"] == 5000
    assert rows[0]["t_lo"] == 0
    assert rows[0]["t_hi"] == 30


def test_departure_follows_a_stop():
    tracker = events.EventTracker()
    tracker.observe({"f": feed(status=STOPPED, stop="X", seq=1)}, {}, now=0.0)
    rows = tracker.observe({"f": feed(status=IN_TRANSIT, stop="Y", seq=2)}, {}, now=30.0)
    assert kinds(rows) == [("depart", "X", "status")]


def test_unseen_dwell_falls_back_to_the_sequence():
    tracker = events.EventTracker()
    tracker.observe({"f": feed(status=IN_TRANSIT, stop="X", seq=1)}, {}, now=0.0)
    rows = tracker.observe({"f": feed(status=IN_TRANSIT, stop="Y", seq=2)}, {}, now=30.0)
    assert kinds(rows) == [("arrive", "X", "seq"), ("depart", "X", "seq")]


def test_stopped_at_a_new_stop_reports_departure_and_arrival():
    tracker = events.EventTracker()
    tracker.observe({"f": feed(status=STOPPED, stop="X", seq=1)}, {}, now=0.0)
    rows = tracker.observe({"f": feed(status=STOPPED, stop="Y", seq=2)}, {}, now=30.0)
    assert kinds(rows) == [("depart", "X", "status"), ("arrive", "Y", "status")]


def test_sequence_jump_emits_a_skip():
    tracker = events.EventTracker()
    tracker.observe({"f": feed(status=IN_TRANSIT, stop="Y", seq=2)}, {}, now=0.0)
    rows = tracker.observe({"f": feed(status=IN_TRANSIT, stop="W", seq=4)}, {}, now=30.0)
    assert ("skip", "Y", "seq") in kinds(rows)
    skip = next(row for row in rows if row["kind"] == "skip")
    assert skip["from_seq"] == 2
    assert skip["to_seq"] == 4


def test_trip_change_closes_the_old_trip():
    tracker = events.EventTracker()
    tracker.observe({"f": feed(trip="T1", stop="X", seq=3)}, {}, now=0.0)
    rows = tracker.observe({"f": feed(trip="T2", stop="Y", seq=1)}, {}, now=30.0)
    assert kinds(rows) == [("trip_end", "X", "trip_change")]


def canceled_feed(relationship: int = gtfs.SCHEDULE_CANCELED) -> gtfs.Feed:
    update = gtfs.TripUpdate(
        trip=gtfs.TripDescriptor(
            trip_id="T9",
            route_id="T",
            start_date="20261027",
            train_id="9T",
            schedule_relationship=relationship,
        )
    )
    return gtfs.Feed(trip_updates=[update])


def test_cancellation_is_detected_without_a_vehicle():
    tracker = events.EventTracker()
    first = tracker.observe({"f": canceled_feed()}, {}, now=0.0, first_cycle=True)
    second = tracker.observe({"f": canceled_feed()}, {}, now=30.0)
    assert kinds(first) == [("cancel", None, "schedule")]
    assert second == []


def test_deleted_trips_are_cancellations_too():
    tracker = events.EventTracker()
    rows = tracker.observe(
        {"f": canceled_feed(gtfs.SCHEDULE_DELETED)}, {}, now=0.0, first_cycle=True
    )
    assert kinds(rows) == [("cancel", None, "schedule")]


def test_vanished_mid_trip_is_a_disappearance():
    tracker = events.EventTracker()
    tracker.observe({"f": feed(status=IN_TRANSIT, stop="Y", seq=2)}, {}, now=0.0)
    rows = tracker.observe({"f": gtfs.Feed()}, {}, now=400.0)
    assert kinds(rows) == [("disappeared", "Y", "absence")]


def test_vanished_after_stopping_is_a_trip_end():
    tracker = events.EventTracker()
    tracker.observe({"f": feed(status=STOPPED, stop="Y", seq=2)}, {}, now=0.0)
    rows = tracker.observe({"f": gtfs.Feed()}, {}, now=400.0)
    assert kinds(rows) == [("trip_end", "Y", "absence")]


def test_a_failed_cycle_suppresses_the_next_bracket():
    tracker = events.EventTracker()
    tracker.observe({"f": feed(status=IN_TRANSIT, stop="X", seq=1)}, {}, now=0.0)
    rows = tracker.observe(
        {"f": feed(status=STOPPED, stop="X", seq=1)}, {}, now=30.0, previous_ok=False
    )
    assert rows == []
    # The state advanced, so the next real transition is still reported.
    rows = tracker.observe({"f": feed(status=IN_TRANSIT, stop="Y", seq=2)}, {}, now=60.0)
    assert kinds(rows) == [("depart", "X", "status")]


def test_event_key_fields_are_carried():
    tracker = events.EventTracker()
    tracker.observe({"gtfs-ace": feed(status=IN_TRANSIT, stop="X", seq=1)}, {}, now=0.0)
    rows = tracker.observe(
        {"gtfs-ace": feed(status=STOPPED, stop="X", seq=1, timestamp=1030)},
        {"1T": {"confidence": 0.87}},
        now=30.0,
    )
    row = rows[0]
    assert row["id"] == "1T"
    assert row["trip"] == "T1"
    assert row["start"] == "20261027"
    assert row["route"] == "T"
    assert row["feed"] == "gtfs-ace"
    assert row["vehicle_ts"] == 1030
    assert row["conf"] == 0.87
    assert row["v"] == 1


def test_bracket_across_a_failed_feed_is_skipped():
    tracker = events.EventTracker()
    tracker.observe({"f": feed(status=IN_TRANSIT, stop="X", seq=1)}, {}, now=0.0)
    rows = tracker.observe(
        {"f": feed(status=STOPPED, stop="X", seq=1)}, {}, now=30.0, previous_failed={"f"}
    )
    assert rows == []


def test_a_failed_feed_does_not_look_like_disappearances():
    tracker = events.EventTracker()
    tracker.observe({"f": feed(status=IN_TRANSIT, stop="X", seq=1)}, {}, now=0.0)
    rows = tracker.observe({"f": gtfs.Feed()}, {}, now=400.0, failed={"f"})
    assert rows == []
    assert tracker.previous == {}

    # On recovery the train is a fresh observation, not a continuation.
    tracker.observe({"f": feed(status=STOPPED, stop="Y", seq=2)}, {}, now=430.0)
    rows = tracker.observe({"f": feed(status=IN_TRANSIT, stop="Z", seq=3)}, {}, now=460.0)
    assert kinds(rows) == [("depart", "Y", "status")]


def test_a_second_stopped_poll_emits_nothing():
    tracker = events.EventTracker()
    tracker.observe({"f": feed(status=STOPPED, stop="X", seq=1)}, {}, now=0.0)
    rows = tracker.observe({"f": feed(status=STOPPED, stop="X", seq=1)}, {}, now=30.0)
    assert rows == []


def test_one_missed_poll_is_not_a_disappearance():
    tracker = events.EventTracker()
    tracker.observe({"f": feed(status=IN_TRANSIT, stop="Y", seq=2)}, {}, now=0.0)
    assert tracker.observe({"f": gtfs.Feed()}, {}, now=60.0) == []
    rows = tracker.observe({"f": gtfs.Feed()}, {}, now=91.0)
    assert kinds(rows) == [("disappeared", "Y", "absence")]
