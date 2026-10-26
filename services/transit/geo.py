"""Geometry helpers for projecting platforms onto shape polylines.

City-scale only: haversine for length, an equirectangular plane for the
point-to-segment projection. Anything more precise is wasted on shapes that are
schematic in places (see the audit this feeds).
"""

from __future__ import annotations

import math
from itertools import pairwise

EARTH_RADIUS_M = 6_371_008.8

Point = tuple[float, float]  # (lat, lon)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def cumulative_m(points: list[Point]) -> list[float]:
    """Distance from the first point to each point, in metres."""
    distances = [0.0]
    for (lat1, lon1), (lat2, lon2) in pairwise(points):
        distances.append(distances[-1] + haversine_m(lat1, lon1, lat2, lon2))
    return distances


def _local_xy(lat: float, lon: float, lat0: float, lon0: float) -> tuple[float, float]:
    x = math.radians(lon - lon0) * math.cos(math.radians(lat0)) * EARTH_RADIUS_M
    y = math.radians(lat - lat0) * EARTH_RADIUS_M
    return x, y


def project_point(
    points: list[Point],
    distances: list[float],
    lat: float,
    lon: float,
    min_m: float = 0.0,
) -> tuple[float, float]:
    """Project a point onto a polyline.

    Returns ``(distance_along_m, lateral_m)`` where the distance is at least
    ``min_m``. The constraint keeps stops monotonic along a trip, which matters on
    shapes that double back on themselves. Lateral distance is always finite: when
    the nearest point falls before ``min_m`` the projection is slid forward to the
    constraint instead of being discarded, and a ``min_m`` past the end clamps to
    the last point.
    """
    if len(points) < 2:
        return (0.0, 0.0)
    total = distances[-1]
    if min_m >= total:
        last_lat, last_lon = points[-1]
        x, y = _local_xy(last_lat, last_lon, lat, lon)
        return (total, math.hypot(x, y))

    best_along = min_m
    best_lateral = math.inf
    for index in range(len(points) - 1):
        start = distances[index]
        end = distances[index + 1]
        if end <= min_m:
            continue
        (lat1, lon1), (lat2, lon2) = points[index], points[index + 1]
        ax, ay = _local_xy(lat1, lon1, lat, lon)
        bx, by = _local_xy(lat2, lon2, lat, lon)
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        t = 0.0 if length_sq == 0 else min(1.0, max(0.0, -(ax * dx + ay * dy) / length_sq))
        along = start + t * (end - start)
        if along < min_m:
            span = end - start
            t = (min_m - start) / span if span else 0.0
            along = min_m
        lateral = math.hypot(ax + t * dx, ay + t * dy)
        if lateral < best_lateral:
            best_lateral = lateral
            best_along = along
    if best_lateral is math.inf:
        return (total, 0.0)
    return (best_along, best_lateral)
