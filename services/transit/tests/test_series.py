"""Series row construction: schema, horizon, and raw timestamps."""

from __future__ import annotations

from .. import gtfs, series


def feed(
    route: str = "G",
    trip: str = "T1",
    start: str = "20261027",
    train: str | None = "1G 2121",
    stop: str = "G29S",
    seq: int | None = 4,
    status: int = 1,
    timestamp: int = 2000,
    stops: tuple[str, ...] = ("G29S", "G24S", "G22S", "G20S", "G18S", "G16S", "G14S", "G12S"),
) -> gtfs.Feed:
    update = gtfs.TripUpdate(
        trip=gtfs.TripDescriptor(
            trip_id=trip,
            route_id=route,
            start_date=start,
            train_id=train,
            nyct_direction=3,
        )
    )
    update.stop_time_updates = [
        gtfs.StopTimeUpdate(
            stop_id=value,
            stop_sequence=index + 1,
            arrival=gtfs.StopTimeEvent(time=3000 + index * 60),
            departure=gtfs.StopTimeEvent(time=3020 + index * 60),
        )
        for index, value in enumerate(stops)
    ]
    vehicle = gtfs.VehiclePosition(
        trip_id=trip,
        stop_id=stop,
        current_stop_sequence=seq,
        current_status=status,
        timestamp=timestamp,
    )
    return gtfs.Feed(trip_updates=[update], vehicles=[vehicle])


POSITIONS = {
    "1G 2121": {
        "pattern": "G-abc",
        "edge": "G-abc:3:G29S>G24S",
        "s": 41.5,
        "s_total": 812.5,
        "v": 11.2,
        "confidence": 0.94,
        "stale": False,
        "reset": False,
    }
}


def test_row_carries_the_whole_contract():
    rows = series.rows({"gtfs-g": feed()}, POSITIONS, "ae12bb22cb7b", now=1000.0)
    assert len(rows) == 1
    row = rows[0]
    assert row["v"] == 2
    assert row["t"] == 1000
    assert row["id"] == "1G 2121"
    assert row["trip"] == "T1"
    assert row["start"] == "20261027"
    assert row["route"] == "G"
    assert row["dir"] == "S"
    assert row["st"] == "STOPPED_AT"
    assert row["pre"] is False
    assert row["stop"] == "G29S"
    assert row["seq"] == 4
    assert row["feed"] == "gtfs-g"
    assert row["pattern"] == "G-abc"
    assert row["edge"] == 3
    assert row["s"] == 812.5
    assert row["speed"] == 11.2
    assert row["conf"] == 0.94
    assert row["stale"] is False
    assert row["reset"] is False
    assert row["graph"] == "ae12bb22cb7b"


def test_vehicle_timestamp_is_stored_raw_even_if_ahead_of_the_poll():
    rows = series.rows({"f": feed(timestamp=5000)}, POSITIONS, None, now=1000.0)
    assert rows[0]["vehicle_ts"] == 5000


def test_next_stops_are_capped_by_the_series_horizon():
    rows = series.rows({"f": feed()}, POSITIONS, None, now=1000.0)
    assert len(rows[0]["next"]) == series.NEXT_STOPS
    assert rows[0]["next"][0] == ["G29S", 3000, 3020]


def test_trains_without_a_vehicle_are_skipped():
    payload = feed()
    payload.vehicles = []
    assert series.rows({"f": payload}, POSITIONS, None, now=1000.0) == []


def test_unpositioned_trains_still_get_a_row():
    rows = series.rows({"f": feed()}, {}, "graph", now=1000.0)
    row = rows[0]
    assert row["pattern"] is None
    assert row["edge"] is None
    assert row["s"] is None
    assert row["speed"] is None
    assert row["conf"] is None


def test_edge_index_parsing():
    assert series.edge_index("G-abc:3:G29S>G24S") == 3
    assert series.edge_index("G-abc:0:A>B") == 0
    assert series.edge_index(None) is None
    assert series.edge_index("") is None
    assert series.edge_index("no-index") is None
    assert series.edge_index("p:not-a-number:A>B") is None


def test_horizon_is_six_while_the_snapshot_stays_at_three():
    from .. import snapshot

    assert series.NEXT_STOPS == 6
    assert snapshot.MAX_NEXT_STOPS == 3


def test_duplicate_train_ids_across_feeds_keep_the_first_row():
    payload = feed()
    rows = series.rows({"a": payload, "b": payload}, POSITIONS, None, now=1000.0)
    assert len(rows) == 1


def test_placeholder_rows_are_flagged_with_a_null_status():
    rows = series.rows({"f": feed(status=None, seq=None)}, {}, None, now=1000.0)
    assert rows[0]["pre"] is True
    assert rows[0]["st"] is None
