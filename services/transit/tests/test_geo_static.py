"""Projection maths and static-feed parsing."""

from __future__ import annotations

import pytest

from .. import geo, gtfs_static
from .static_fixture import write_gtfs


def test_haversine_degree_of_latitude():
    # One degree of latitude is ~111.2 km; the exact value depends on the radius.
    assert round(geo.haversine_m(40.0, -73.0, 41.0, -73.0)) == pytest.approx(111195, abs=40)


def test_cumulative_distance_matches_segments():
    points = [(40.0, -73.0), (40.001, -73.0), (40.002, -73.0)]
    distances = geo.cumulative_m(points)
    assert distances[0] == 0
    assert distances[1] == pytest.approx(111.2, abs=1)
    assert distances[2] == pytest.approx(222.4, abs=2)


def test_projection_finds_distance_and_offset():
    points = [(40.0, -73.0), (40.001, -73.0)]
    distances = geo.cumulative_m(points)
    # A point beside the midpoint of the segment.
    along, lateral = geo.project_point(points, distances, 40.0005, -72.9995)
    assert along == pytest.approx(55.6, abs=2)
    assert lateral == pytest.approx(42.3, abs=3)


def test_projection_respects_minimum():
    points = [(40.0, -73.0), (40.001, -73.0)]
    distances = geo.cumulative_m(points)
    along, _ = geo.project_point(points, distances, 40.0001, -73.0, min_m=80.0)
    assert along >= 80.0


def test_feed_info_parsing_and_expiry(tmp_path):
    path = write_gtfs(tmp_path, end_date="20200101")
    tables, info = gtfs_static.load(path)
    assert info.version == "TEST-1"
    assert info.start_date == "20260101"
    assert info.end_date == "20200101"
    assert info.expired() is True
    assert info.days_left() is not None and info.days_left() < 0
    assert "expired" in gtfs_static.window_label(info)
    assert tables["stops.txt"]


def test_future_feed_is_not_expired(tmp_path):
    _, info = gtfs_static.load(write_gtfs(tmp_path))
    assert info.expired() is False
    assert info.days_left() is not None and info.days_left() > 0


def test_projection_past_constraint_still_returns_lateral():
    points = [(40.0, -73.0), (40.001, -73.0)]
    distances = geo.cumulative_m(points)
    # The nearest point is at 11 m, but the constraint is 80 m: slide forward.
    along, lateral = geo.project_point(points, distances, 40.0001, -73.0, min_m=80.0)
    assert along >= 80.0
    assert lateral != pytest.approx(float("inf"))
    assert lateral < 100


def test_projection_beyond_shape_end_clamps():
    points = [(40.0, -73.0), (40.001, -73.0)]
    distances = geo.cumulative_m(points)
    along, lateral = geo.project_point(points, distances, 40.0, -73.0, min_m=10_000.0)
    # Past the end, the projection clamps to the last point; the lateral distance is
    # then just the distance from the query to that point.
    assert along == pytest.approx(distances[-1])
    assert lateral == pytest.approx(geo.haversine_m(40.0, -73.0, 40.001, -73.0), abs=1)


def test_projection_on_doubled_back_shape():
    # Out and back along the same line: the constraint must pick the return pass.
    points = [(40.0, -73.0), (40.001, -73.0), (40.0, -73.0)]
    distances = geo.cumulative_m(points)
    along, lateral = geo.project_point(points, distances, 40.0005, -73.0, min_m=150.0)
    assert along > distances[1]
    assert lateral < 1
