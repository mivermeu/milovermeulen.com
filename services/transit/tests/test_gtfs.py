"""Fixture-backed tests for the GTFS-realtime decoder.

The fixtures are real captured payloads (2026-10-26, ~21:30 ET), so these tests
pin both the wire format and the NYCT extensions against reality rather than
against our own encoder.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .. import gtfs
from .wire import feed as build_feed
from .wire import ld, vi

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> gtfs.Feed:
    return gtfs.parse_feed((FIXTURES / name).read_bytes())


def test_parses_header():
    feed = load("gtfs-g.pb")
    assert feed.version == "1.0"
    assert feed.header_ts is not None and feed.header_ts > 0


def test_counts_trip_updates_and_vehicles():
    feed = load("gtfs-g.pb")
    assert len(feed.trip_updates) == 20
    assert len(feed.vehicles) == 20
    assert not feed.alerts


def test_trip_update_contents():
    feed = load("gtfs-g.pb")
    with_stops = [update for update in feed.trip_updates if update.stop_time_updates]
    assert with_stops, "fixture should contain at least one trip with stop times"
    update = with_stops[0]
    assert update.trip.trip_id
    assert update.trip.route_id == "G"
    assert update.trip.start_date
    first = update.stop_time_updates[0]
    assert first.stop_id
    assert first.arrival is not None and first.arrival.time


def test_vehicle_contents():
    feed = load("gtfs-g.pb")
    vehicle = feed.vehicles[0]
    assert vehicle.trip_id
    assert vehicle.stop_id
    assert vehicle.current_stop_sequence is not None
    assert vehicle.current_status in (0, 1, 2)
    assert vehicle.timestamp


def test_nyct_train_descriptor_extension():
    feed = load("gtfs-g.pb")
    trains = [update.trip.train_id for update in feed.trip_updates if update.trip.train_id]
    assert trains, "NYCT train_id extension should be present on trips"
    assert " " in trains[0]


def test_nyct_track_extension():
    feed = load("gtfs-g.pb")
    tracks = [
        stop
        for update in feed.trip_updates
        for stop in update.stop_time_updates
        if stop.scheduled_track
    ]
    assert tracks, "NYCT track extension should be present on stop times"
    assert tracks[0].actual_track


def test_alerts():
    feed = load("alerts.pb")
    assert len(feed.alerts) == 3
    alert = feed.alerts[0]
    assert alert.id
    assert alert.header
    assert alert.route_ids, "alerts should name at least one route"


def test_rejects_truncated_payload():
    with pytest.raises(gtfs.GtfsRtError):
        gtfs.parse_feed((FIXTURES / "truncated.pb").read_bytes())


def test_rejects_empty_payload():
    with pytest.raises(gtfs.GtfsRtError):
        gtfs.parse_feed(b"")


def test_rejects_non_protobuf_payload():
    with pytest.raises(gtfs.GtfsRtError):
        gtfs.parse_feed(b"<html>not a feed</html>")


def test_negative_delay_is_sign_extended():
    # proto2 encodes int32 -138 as a ten-byte varint sign-extended to 64 bits.
    encoded = (1 << 64) - 138
    event = vi(1, encoded)
    stop_time = ld(4, b"A01N") + ld(2, event)
    trip_update = ld(1, ld(1, b"trip-1")) + ld(2, stop_time) + vi(5, encoded)

    feed = gtfs.parse_feed(build_feed([ld(3, trip_update)]))

    update = feed.trip_updates[0]
    assert update.delay == -138
    assert update.stop_time_updates[0].arrival is not None
    assert update.stop_time_updates[0].arrival.delay == -138


def test_missing_current_status_means_in_transit_to():
    vehicle = ld(1, ld(1, b"trip-2")) + ld(7, b"A02N") + vi(3, 5)
    feed = gtfs.parse_feed(build_feed([ld(4, vehicle)]))
    assert feed.vehicles[0].current_status == 2
    assert feed.vehicles[0].stop_id == "A02N"


def test_incrementality_is_surfaced():
    feed = gtfs.parse_feed(build_feed([], incrementality=1))
    assert feed.incrementality == 1
    assert not feed.trip_updates


def test_schedule_relationship_is_parsed():
    stop_time = ld(4, b"A01N") + vi(5, 1)
    trip = ld(1, b"trip-1") + vi(4, 3)
    trip_update = ld(1, trip) + ld(2, stop_time)

    feed = gtfs.parse_feed(build_feed([ld(3, trip_update)]))

    assert feed.trip_updates[0].trip.schedule_relationship == 3
    assert feed.trip_updates[0].stop_time_updates[0].schedule_relationship == 1
