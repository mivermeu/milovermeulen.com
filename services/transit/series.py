"""Per-train series rows: the long-lived feature history.

One row per observed train per sample (every ``series_every`` cycles, 60 s by
default). Built from the parsed feeds rather than the served snapshot, so the
horizon is not capped by what the renderer needs.

The row is self-describing: ``v`` is the schema version, ``t`` the poll time and
``vehicle_ts`` the feed's own observation time (stored raw — it can sit ahead of
the poll clock). Positions are along-track (``pattern`` + ``edge`` + ``s``)
rather than lat/lon: that stays comparable across trains and can be projected
later against the graph named by ``graph``.
"""

from __future__ import annotations

from typing import Any

from . import gtfs

SCHEMA_VERSION = 2
# The served snapshot caps at three stops for the renderer; the series can afford
# a longer feature horizon.
NEXT_STOPS = 6


def edge_index(edge: str | None) -> int | None:
    """Extract the edge index from ``<pattern>:<index>:<from>><to>``."""
    if not edge:
        return None
    parts = edge.split(":")
    if len(parts) < 2:
        return None
    try:
        return int(parts[1])
    except ValueError:
        return None


def _next_stops(update: gtfs.TripUpdate) -> list[list[Any]]:
    return [
        [
            stop.stop_id,
            stop.arrival.time if stop.arrival else None,
            stop.departure.time if stop.departure else None,
        ]
        for stop in update.stop_time_updates[:NEXT_STOPS]
    ]


def rows(
    trip_feeds: dict[str, gtfs.Feed],
    positions: dict[str, dict[str, Any]],
    graph_hash: str | None,
    now: float,
) -> list[dict[str, Any]]:
    stamp = int(now)
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for feed_name, feed in trip_feeds.items():
        vehicles = {vehicle.trip_id: vehicle for vehicle in feed.vehicles if vehicle.trip_id}
        for update in feed.trip_updates:
            vehicle = vehicles.get(update.trip.trip_id)
            if vehicle is None:
                continue
            key = update.trip.train_id or vehicle.vehicle_id or update.trip.trip_id or ""
            if key in seen:
                continue
            seen.add(key)
            position = positions.get(key, {})
            observed_stop = vehicle.stop_id or next(
                (stop.stop_id for stop in update.stop_time_updates if stop.stop_id), None
            )
            result.append(
                {
                    "v": SCHEMA_VERSION,
                    "t": stamp,
                    "id": key,
                    "trip": update.trip.trip_id,
                    "start": update.trip.start_date,
                    "route": update.trip.route_id,
                    "dir": gtfs.trip_direction(update.trip),
                    "st": gtfs.vehicle_status_name(vehicle.current_status),
                    "stop": observed_stop,
                    "seq": vehicle.current_stop_sequence,
                    "feed": feed_name,
                    "vehicle_ts": vehicle.timestamp,
                    "pre": gtfs.is_placeholder(vehicle),
                    "pattern": position.get("pattern"),
                    "edge": edge_index(position.get("edge")),
                    "s": position.get("s_total"),
                    "speed": position.get("v"),
                    "conf": position.get("confidence"),
                    "stale": position.get("stale"),
                    "reset": position.get("reset"),
                    "graph": graph_hash,
                    "next": _next_stops(update),
                }
            )
    return result
