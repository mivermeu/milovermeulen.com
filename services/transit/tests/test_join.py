"""Live-trip to static-pattern matching."""

from __future__ import annotations

from .. import join


def graph_with(patterns: list[tuple[str, str, list[str]]]) -> dict:
    return {
        "patterns": [
            {
                "id": f"{route}-{index}",
                "route": route,
                "dir": direction,
                "stops": [[stop, position * 100.0] for position, stop in enumerate(stops)],
            }
            for index, (route, direction, stops) in enumerate(patterns)
        ]
    }


def test_exact_contiguous_match():
    index = join.PatternIndex(graph_with([("A", "N", ["A1", "A2", "A3", "A4"])]))
    match = index.match("A", ["A2", "A3", "A4"], "N")
    assert match is not None
    assert match.confidence == 1.0
    assert match.start_index == 1
    assert match.pattern_id == "A-0"


def test_unrelated_route_does_not_match():
    index = join.PatternIndex(graph_with([("A", "N", ["A1", "A2", "A3"])]))
    assert index.match("B", ["A1", "A2", "A3"], "N") is None
    assert index.match(None, ["A1"], None) is None
    assert index.match("A", [], None) is None


def test_one_stop_drift_is_tolerated():
    stops = [f"S{number}" for number in range(10)]
    index = join.PatternIndex(graph_with([("T", "N", stops)]))
    live = [*stops[:9], "UNKNOWN"]
    match = index.match("T", live, "N")
    assert match is not None
    assert 0.89 <= match.confidence <= 1.0


def test_large_drift_is_rejected():
    stops = [f"S{number}" for number in range(10)]
    index = join.PatternIndex(graph_with([("T", "N", stops)]))
    match = index.match("T", [stops[0], "X1", "X2", "X3", "X4"], "N")
    assert match is None


def test_direction_breaks_a_tie():
    patterns = [
        ("T", "S", ["T1N", "T2N", "T3N"]),
        ("T", "N", ["T1N", "T2N", "T3N"]),
    ]
    index = join.PatternIndex(graph_with(patterns))
    match = index.match("T", ["T1N", "T2N", "T3N"], "N")
    assert match is not None
    assert match.pattern_id == "T-1"


def test_pattern_lookup():
    index = join.PatternIndex(graph_with([("T", "N", ["T1N", "T2N"])]))
    assert index.pattern("T-0") is not None
    assert index.pattern("missing") is None
    assert index.routes() == ["T"]


def test_single_stop_sequence_does_not_match():
    index = join.PatternIndex(graph_with([("T", "N", ["T1N", "T2N", "T3N"])]))
    assert index.match("T", ["T2N"], "N") is None
