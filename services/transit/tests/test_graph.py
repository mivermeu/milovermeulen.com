"""Graph construction from static GTFS, serialisation and artifacts."""

from __future__ import annotations

import json
import sys
from array import array

from .. import graph, gtfs_static
from .static_fixture import write_gtfs


def build(tmp_path) -> graph.Graph:
    path = write_gtfs(tmp_path)
    info = gtfs_static.parse_feed_info(path.read_bytes())
    tables = gtfs_static.read_tables(path, gtfs_static.SMALL_TABLES)
    return graph.build(tables, info.version, now=1792978330.0, source=path)


def test_stations_and_platforms(tmp_path):
    built = build(tmp_path)
    assert len(built.stations) == 4
    assert len(built.platforms) == 8
    assert built.platforms["T2N"]["station"] == "T2"
    assert built.platforms["T2N"]["dir"] == "N"
    assert built.platforms["T2S"]["dir"] == "S"


def test_patterns_are_deduplicated(tmp_path):
    built = build(tmp_path)
    assert len(built.patterns) == 2
    north = next(pattern for pattern in built.patterns if pattern.direction == "N")
    assert [stop for stop, _ in north.stops] == ["T1N", "T2N", "T3N", "T4N"]
    assert north.route == "T"
    assert north.shape_id == "SH-N"


def test_stop_distances_are_monotonic_and_measured(tmp_path):
    built = build(tmp_path)
    north = next(pattern for pattern in built.patterns if pattern.direction == "N")
    distances = [distance for _, distance in north.stops]
    assert distances[0] == 0
    assert distances == sorted(distances)
    assert abs(distances[1] - 111.2) < 1
    assert north.length_m == distances[-1]


def test_serialisation_offsets_match_binary(tmp_path):
    built = build(tmp_path)
    document = graph.to_dict(built)
    payload = graph.shape_bytes(built)

    values = array("f")
    values.frombytes(payload)
    if sys.byteorder != "little":
        values.byteswap()

    assert len(values) == sum(shape["count"] for shape in document["shapes"]) * 2
    for shape in document["shapes"]:
        assert shape["offset"] + shape["count"] * 2 <= len(values)
        assert 40.0 <= values[shape["offset"]] <= 40.1


def test_write_artifacts_publishes_manifest(tmp_path):
    built = build(tmp_path)
    www = tmp_path / "www"
    manifest = graph.write_artifacts(built, www)

    assert (www / "graph.json").exists()
    assert (www / manifest["graph"]).exists()
    assert (www / manifest["shapes"]).exists()
    assert (www / "audit.json").exists()
    assert manifest["patterns"] == 2

    reloaded = graph.load_graph(www)
    assert reloaded is not None
    assert len(reloaded["patterns"]) == 2
    assert json.loads((www / "graph.json").read_text())["hash"] == manifest["hash"]


def test_rebuild_is_content_addressed(tmp_path):
    built = build(tmp_path)
    www = tmp_path / "www"
    first = graph.write_artifacts(built, www)
    second = graph.write_artifacts(built, www)
    assert first["hash"] == second["hash"]
    assert len(list(www.glob("graph-*.json"))) == 1


def test_hash_ignores_build_time(tmp_path):
    path = write_gtfs(tmp_path)
    info = gtfs_static.parse_feed_info(path.read_bytes())
    tables = gtfs_static.read_tables(path, gtfs_static.SMALL_TABLES)
    first = graph.build(tables, info.version, now=1.0, source=path)
    second = graph.build(tables, info.version, now=2_000_000_000.0, source=path)
    www = tmp_path / "www"
    assert graph.write_artifacts(first, www)["hash"] == graph.write_artifacts(second, www)["hash"]
    assert len(list(www.glob("graph-*.json"))) == 1
