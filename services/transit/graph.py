"""Build the directed stop graph from static GTFS.

Output is two files plus a manifest:

* ``graph-<hash>.json`` — stations, platforms, patterns (ordered stops with the
  distance along their shape), and shape offsets.
* ``shapes-<hash>.bin`` — little-endian float32 lat/lon pairs.
* ``graph.json`` — manifest naming the current pair, so a rebuild is atomic and
  cacheable by content hash.

Patterns are the unit everything else keys off: a route's distinct ordered stop
sequence on a shape. Realtime trip ids do not join to static ones (MTA prefixes
them), so the join is by route + stop sequence — see ``join.py``.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sys
import time
from array import array
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import geo, gtfs_static

log = logging.getLogger("transit.graph")

SCHEMA_VERSION = 1
AUDIT_THRESHOLD_M = 25.0


@dataclass(slots=True)
class Shape:
    shape_id: str
    points: list[geo.Point] = field(default_factory=list)
    distances: list[float] = field(default_factory=list)
    length_m: float = 0.0


@dataclass(slots=True)
class Pattern:
    key: str
    route: str
    direction: str
    shape_id: str
    stops: list[tuple[str, float]] = field(default_factory=list)

    @property
    def length_m(self) -> float:
        return self.stops[-1][1] if self.stops else 0.0

    def stop_index(self, stop_id: str) -> int | None:
        for index, (candidate, _) in enumerate(self.stops):
            if candidate == stop_id:
                return index
        return None


@dataclass(slots=True)
class Graph:
    feed_version: str | None
    built_at: int
    stations: list[dict[str, Any]]
    platforms: dict[str, dict[str, Any]]
    patterns: list[Pattern]
    shapes: dict[str, Shape]
    audit: list[dict[str, Any]]


def _float(value: str | None) -> float:
    try:
        return float(value or "")
    except ValueError:
        return 0.0


def _direction(stop_id: str) -> str:
    return stop_id[-1] if stop_id and stop_id[-1] in "NSEW" else ""


def _pattern_key(route: str, shape_id: str, stops: tuple[str, ...]) -> str:
    digest = hashlib.blake2s(f"{route}|{shape_id}|{'|'.join(stops)}".encode(), digest_size=6)
    return f"{route}-{digest.hexdigest()}"


def _build_shapes(rows: list[dict[str, str]]) -> dict[str, Shape]:
    grouped: dict[str, list[tuple[int, float, float]]] = {}
    for row in rows:
        shape_id = row["shape_id"]
        grouped.setdefault(shape_id, []).append(
            (
                int(row["shape_pt_sequence"]),
                _float(row["shape_pt_lat"]),
                _float(row["shape_pt_lon"]),
            )
        )
    shapes: dict[str, Shape] = {}
    for shape_id, points in grouped.items():
        points.sort()
        shape = Shape(shape_id=shape_id, points=[(lat, lon) for _, lat, lon in points])
        shape.distances = geo.cumulative_m(shape.points)
        shape.length_m = shape.distances[-1] if shape.distances else 0.0
        shapes[shape_id] = shape
    return shapes


def _build_trip_stops(rows: list[dict[str, str]]) -> dict[str, list[str]]:
    grouped: dict[str, list[tuple[int, str]]] = {}
    for row in rows:
        trip_id = sys.intern(row["trip_id"])
        stop_id = sys.intern(row["stop_id"])
        grouped.setdefault(trip_id, []).append((int(row["stop_sequence"]), stop_id))
    return {
        trip_id: [stop_id for _, stop_id in sorted(stops)] for trip_id, stops in grouped.items()
    }


def build(
    tables: dict[str, list[dict[str, str]]],
    feed_version: str | None = None,
    now: float | None = None,
    source: Path | None = None,
) -> Graph:
    stamp = int(time.time() if now is None else now)

    stations: list[dict[str, Any]] = []
    platforms: dict[str, dict[str, Any]] = {}
    for row in tables.get("stops.txt", []):
        stop_id = row["stop_id"]
        lat, lon = _float(row["stop_lat"]), _float(row["stop_lon"])
        if row.get("location_type") == "1":
            stations.append(
                {"id": stop_id, "name": row.get("stop_name", ""), "lat": lat, "lon": lon}
            )
        else:
            platforms[stop_id] = {
                "id": stop_id,
                "station": row.get("parent_station") or stop_id,
                "name": row.get("stop_name", ""),
                "lat": lat,
                "lon": lon,
                "dir": _direction(stop_id),
            }

    shape_rows = (
        gtfs_static.stream_rows(source, "shapes.txt")
        if source is not None
        else tables.get("shapes.txt", [])
    )
    shapes = _build_shapes(shape_rows)

    trips: dict[str, tuple[str, str, str]] = {}
    for row in tables.get("trips.txt", []):
        trips[row["trip_id"]] = (
            row.get("route_id", ""),
            row.get("direction_id", ""),
            row.get("shape_id", ""),
        )

    stop_time_rows = (
        gtfs_static.stream_rows(source, "stop_times.txt")
        if source is not None
        else tables.get("stop_times.txt", [])
    )
    trip_stops = _build_trip_stops(stop_time_rows)

    patterns: dict[tuple[str, str, str], Pattern] = {}
    audit: list[dict[str, Any]] = []
    missing_stops = 0
    shapeless_trips = 0
    for trip_id, stops in trip_stops.items():
        meta = trips.get(trip_id)
        if not meta or not stops:
            continue
        route, _direction_id, shape_id = meta
        shape = shapes.get(shape_id)
        if shape is None:
            # 17.7% of trips in the current feed carry no shape_id at all; they are
            # counted rather than guessed at with a straight line through platforms.
            shapeless_trips += 1
            continue
        signature = (route, shape_id, tuple(stops))
        if signature in patterns:
            continue
        pattern = Pattern(
            key=_pattern_key(route, shape_id, tuple(stops)),
            route=route,
            direction=_direction(stops[0]),
            shape_id=shape_id,
        )
        previous = 0.0
        for stop_id in stops:
            platform = platforms.get(stop_id)
            if platform is None:
                missing_stops += 1
                audit.append(
                    {"pattern": pattern.key, "route": route, "stop": stop_id, "issue": "unknown"}
                )
                pattern.stops.append((stop_id, previous))
                continue
            along, lateral = geo.project_point(
                shape.points, shape.distances, platform["lat"], platform["lon"], previous
            )
            if lateral is None or lateral > AUDIT_THRESHOLD_M:
                audit.append(
                    {
                        "pattern": pattern.key,
                        "route": route,
                        "stop": stop_id,
                        "lateral_m": round(float(lateral), 1),
                    }
                )
            pattern.stops.append((stop_id, along))
            previous = along
        patterns[signature] = pattern

    ordered = sorted(patterns.values(), key=lambda item: (item.route, item.shape_id, item.key))
    log.info(
        "graph: %d stations, %d platforms, %d shapes, %d patterns, %d audit rows, "
        "%d unknown stops, %d trips without shape_id",
        len(stations),
        len(platforms),
        len(shapes),
        len(ordered),
        len(audit),
        missing_stops,
        shapeless_trips,
    )
    return Graph(
        feed_version=feed_version,
        built_at=stamp,
        stations=stations,
        platforms=platforms,
        patterns=ordered,
        shapes=shapes,
        audit=audit,
    )


def to_dict(graph: Graph) -> dict[str, Any]:
    """Serialise everything except shape coordinates (which go to the binary)."""
    offset = 0
    shapes = []
    for shape_id, shape in graph.shapes.items():
        shapes.append(
            {
                "id": shape_id,
                "offset": offset,
                "count": len(shape.points),
                "length_m": round(shape.length_m, 1),
            }
        )
        offset += len(shape.points) * 2
    return {
        "v": SCHEMA_VERSION,
        "built_at": graph.built_at,
        "feed_version": graph.feed_version,
        "stations": graph.stations,
        "platforms": list(graph.platforms.values()),
        "shapes": shapes,
        "patterns": [
            {
                "id": pattern.key,
                "route": pattern.route,
                "dir": pattern.direction,
                "shape": pattern.shape_id,
                "length_m": round(pattern.length_m, 1),
                "stops": [[stop_id, round(dist, 1)] for stop_id, dist in pattern.stops],
            }
            for pattern in graph.patterns
        ],
    }


def shape_bytes(graph: Graph) -> bytes:
    values = array("f")
    for shape in graph.shapes.values():
        for lat, lon in shape.points:
            values.append(lat)
            values.append(lon)
    if sys.byteorder != "little":
        values.byteswap()
    return values.tobytes()


def _write_atomic(path: Path, payload: bytes) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    with temporary.open("wb") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def write_artifacts(
    graph: Graph,
    www_dir: Path,
    audit_limit: int = 500,
) -> dict[str, Any]:
    document = to_dict(graph)
    # built_at is excluded from the digest: the same feed must keep the same
    # content-addressed filenames, or every rebuild invalidates every client cache.
    canonical = {key: value for key, value in document.items() if key != "built_at"}
    graph_payload = json.dumps(document, separators=(",", ":")).encode("utf-8")
    digest_payload = json.dumps(canonical, separators=(",", ":"), sort_keys=True).encode("utf-8")
    shapes_payload = shape_bytes(graph)
    digest = hashlib.sha256(digest_payload + shapes_payload).hexdigest()[:12]

    www_dir.mkdir(parents=True, exist_ok=True)
    graph_name = f"graph-{digest}.json"
    shapes_name = f"shapes-{digest}.bin"
    _write_atomic(www_dir / graph_name, graph_payload)
    _write_atomic(www_dir / shapes_name, shapes_payload)

    manifest = {
        "v": SCHEMA_VERSION,
        "hash": digest,
        "graph": graph_name,
        "shapes": shapes_name,
        "built_at": graph.built_at,
        "feed_version": graph.feed_version,
        "patterns": len(graph.patterns),
        "shapes_count": len(graph.shapes),
    }
    _write_atomic(www_dir / "graph.json", (json.dumps(manifest, indent=2) + "\n").encode())

    ranked = sorted(
        (row for row in graph.audit if "lateral_m" in row),
        key=lambda row: row["lateral_m"],
        reverse=True,
    )
    unknown = [row for row in graph.audit if "issue" in row]
    audit = {
        "built_at": graph.built_at,
        "feed_version": graph.feed_version,
        "threshold_m": AUDIT_THRESHOLD_M,
        "over_threshold": len(ranked),
        "unknown_stops": unknown[:audit_limit],
        "worst": ranked[:audit_limit],
    }
    _write_atomic(www_dir / "audit.json", (json.dumps(audit, indent=2) + "\n").encode())

    for stale in www_dir.glob("graph-*.json"):
        if stale.name != graph_name:
            stale.unlink(missing_ok=True)
    for stale in www_dir.glob("shapes-*.bin"):
        if stale.name != shapes_name:
            stale.unlink(missing_ok=True)

    log.info(
        "artifacts: %s (%.0f KB), %s (%.0f KB), audit %d rows over %.0f m",
        graph_name,
        len(graph_payload) / 1024,
        shapes_name,
        len(shapes_payload) / 1024,
        len(ranked),
        AUDIT_THRESHOLD_M,
    )
    return manifest


def load_manifest(www_dir: Path) -> dict[str, Any] | None:
    path = www_dir / "graph.json"
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def load_graph(www_dir: Path) -> dict[str, Any] | None:
    """Load the current graph document (without the binary shape payload)."""
    manifest = load_manifest(www_dir)
    if not manifest:
        return None
    try:
        return json.loads((www_dir / manifest["graph"]).read_text())
    except (OSError, ValueError):
        return None
