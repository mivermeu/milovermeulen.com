"""Merge decoded feeds into the snapshot the frontend consumes.

Schema v0 is deliberately stop-level: it needs no track graph, so the service can
ship before the static-GTFS work lands. v1 adds ``edge``/``s``/``v``/``confidence``
additively — readers written against v0 keep working.
"""

from __future__ import annotations

import time
from typing import Any

from . import gtfs

SCHEMA_VERSION = 0
MAX_NEXT_STOPS = 3

# GTFS-realtime VehicleStopStatus.
_STATUS = {0: "INCOMING_AT", 1: "STOPPED_AT", 2: "IN_TRANSIT_TO"}


def _event_time(event: gtfs.StopTimeEvent | None) -> int | None:
    return event.time if event is not None and event.time else None


def _next_stops(update: gtfs.TripUpdate) -> list[dict[str, Any]]:
    return [
        {
            "stop": stop.stop_id,
            "arr": _event_time(stop.arrival),
            "dep": _event_time(stop.departure),
        }
        for stop in update.stop_time_updates[:MAX_NEXT_STOPS]
    ]


def _vehicles_by_trip(feeds: dict[str, gtfs.Feed]) -> dict[str, gtfs.VehiclePosition]:
    vehicles: dict[str, gtfs.VehiclePosition] = {}
    for feed in feeds.values():
        for vehicle in feed.vehicles:
            if vehicle.trip_id:
                vehicles[vehicle.trip_id] = vehicle
    return vehicles


def _train(update: gtfs.TripUpdate, vehicle: gtfs.VehiclePosition) -> dict[str, Any]:
    trip = update.trip
    first_stop = update.stop_time_updates[0].stop_id if update.stop_time_updates else None
    return {
        "id": trip.train_id or vehicle.vehicle_id or trip.trip_id,
        "trip": trip.trip_id,
        "route": trip.route_id,
        "dir": gtfs.trip_direction(trip),
        "start_date": trip.start_date,
        "status": _STATUS.get(vehicle.current_status),
        "stop": vehicle.stop_id or first_stop,
        "seq": vehicle.current_stop_sequence,
        "vehicle_ts": vehicle.timestamp,
        "next": _next_stops(update),
    }


def build(
    trip_feeds: dict[str, gtfs.Feed],
    alerts_feed: gtfs.Feed | None,
    health: dict[str, dict[str, Any]],
    now: float | None = None,
) -> dict[str, Any]:
    stamp = time.time() if now is None else now
    vehicles = _vehicles_by_trip(trip_feeds)

    trains: list[dict[str, Any]] = []
    scheduled = 0
    header_ts: int | None = None
    for feed in trip_feeds.values():
        if feed.header_ts and (header_ts is None or feed.header_ts > header_ts):
            header_ts = feed.header_ts
        for update in feed.trip_updates:
            vehicle = vehicles.get(update.trip.trip_id or "")
            if vehicle is None:
                # Scheduled but not assigned to a physical train yet: it has no
                # observable position, so it is counted rather than rendered.
                scheduled += 1
                continue
            trains.append(_train(update, vehicle))
    trains.sort(key=lambda train: (train["route"] or "", train["trip"] or ""))

    alerts = [
        {
            "id": alert.id,
            "effect": alert.effect,
            "cause": alert.cause,
            "header": alert.header,
            "routes": sorted(set(alert.route_ids)),
            "stops": sorted(set(alert.stop_ids)),
        }
        for alert in (alerts_feed.alerts if alerts_feed else [])
    ]

    return {
        "v": SCHEMA_VERSION,
        "generated_at": int(stamp),
        "header_ts": header_ts,
        "feeds": health,
        "scheduled_trips": scheduled,
        "trains": trains,
        "alerts": alerts,
    }
