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
import statistics
import sys
import time
from array import array
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import geo, gtfs_static

log = logging.getLogger("transit.graph")

SCHEMA_VERSION = 2
AUDIT_THRESHOLD_M = 25.0
# Scheduled values outside these bounds are feed noise, not train movements.
MIN_RUN_S = 3.0
MAX_RUN_S = 3600.0
MAX_DWELL_S = 1800.0


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
    # Per edge: median scheduled run seconds (departure -> next arrival) and
    # scheduled dwell seconds at the edge's starting stop. These are the prior
    # the estimator uses instead of a single global cruise speed.
    runs: list[float] = field(default_factory=list)
    dwells: list[float] = field(default_factory=list)

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


def _seconds(value: str | None) -> float | None:
    """Parse a GTFS ``HH:MM:SS`` time; hours may exceed 24 for after-midnight trips."""
    if not value:
        return None
    parts = value.split(":")
    if len(parts) != 3:
        return None
    try:
        hours, minutes, seconds = (int(part) for part in parts)
    except ValueError:
        return None
    return hours * 3600 + minutes * 60 + seconds


def _build_trip_stops(
    rows: list[dict[str, str]],
) -> dict[str, list[tuple[int, str, float | None, float | None]]]:
    grouped: dict[str, list[tuple[int, str, float | None, float | None]]] = {}
    for row in rows:
        trip_id = sys.intern(row["trip_id"])
        stop_id = sys.intern(row["stop_id"])
        grouped.setdefault(trip_id, []).append(
            (
                int(row["stop_sequence"]),
                stop_id,
                _seconds(row.get("arrival_time")),
                _seconds(row.get("departure_time")),
            )
        )
    return {trip_id: sorted(stops) for trip_id, stops in grouped.items()}


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
    # signature -> per edge: raw scheduled run/dwell samples across every trip
    # that uses this pattern. Medians are taken after all trips are read.
    edge_samples: dict[tuple[str, str, tuple[str, ...]], list[dict[str, list[float]]]] = {}
    audit: list[dict[str, Any]] = []
    missing_stops = 0
    shapeless_trips = 0
    for trip_id, entries in trip_stops.items():
        meta = trips.get(trip_id)
        if not meta or not entries:
            continue
        route, _direction_id, shape_id = meta
        shape = shapes.get(shape_id)
        if shape is None:
            # 17.7% of trips in the current feed carry no shape_id at all; they are
            # counted rather than guessed at with a straight line through platforms.
            shapeless_trips += 1
            continue
        stop_ids = tuple(stop_id for _, stop_id, _, _ in entries)
        signature = (route, shape_id, stop_ids)
        pattern = patterns.get(signature)
        if pattern is None:
            pattern = Pattern(
                key=_pattern_key(route, shape_id, stop_ids),
                route=route,
                direction=_direction(stop_ids[0]),
                shape_id=shape_id,
            )
            previous = 0.0
            for stop_id in stop_ids:
                platform = platforms.get(stop_id)
                if platform is None:
                    missing_stops += 1
                    audit.append(
                        {
                            "pattern": pattern.key,
                            "route": route,
                            "stop": stop_id,
                            "issue": "unknown",
                        }
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
            edge_samples[signature] = [
                {"run": [], "dwell": []} for _ in range(max(0, len(stop_ids) - 1))
            ]

        buffer = edge_samples[signature]
        for index in range(min(len(entries) - 1, len(buffer))):
            _, _, arrival, departure = entries[index]
            _, _, next_arrival, _ = entries[index + 1]
            leave = departure if departure is not None else arrival
            if leave is not None and next_arrival is not None:
                run = next_arrival - leave
                if MIN_RUN_S <= run <= MAX_RUN_S:
                    buffer[index]["run"].append(run)
            if arrival is not None and departure is not None:
                dwell = departure - arrival
                if 0.0 <= dwell <= MAX_DWELL_S:
                    buffer[index]["dwell"].append(dwell)

    for signature, pattern in patterns.items():
        buffer = edge_samples.get(signature, [])
        for index in range(max(0, len(pattern.stops) - 1)):
            sample = buffer[index] if index < len(buffer) else {"run": [], "dwell": []}
            pattern.runs.append(
                float(statistics.median(sample["run"])) if sample["run"] else 0.0
            )
            pattern.dwells.append(
                float(statistics.median(sample["dwell"])) if sample["dwell"] else 0.0
            )

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
                # Aligned with the edges (len(stops) - 1): scheduled run and
                # dwell seconds, medians over the trips that use this pattern.
                "edge_times": [
                    [round(run, 1), round(dwell, 1)]
                    for run, dwell in zip(pattern.runs, pattern.dwells, strict=False)
                ],
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

    # Superseded artifacts are kept: historical series/events rows name the graph
    # they were computed against, and a hash without the artifact is decorative.
    # Each pair is ~1.4 MB per weekly rebuild.

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
