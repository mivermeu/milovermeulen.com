"""Match a live trip's remaining stops to a static pattern.

Realtime trip ids are not static trip ids — MTA prefixes the static ones and the
patterns drift (`S03R` vs `S04R`), so joining on the id matches ~0%. The join is
therefore on route + ordered stop list: an exact contiguous run scores 1.0, and a
small tolerance covers the one-stop drift that schedule updates produce.

``start_index`` is where the live sequence enters the pattern, which is what the
estimator needs to place a train along the shape.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

log = logging.getLogger("transit.join")

MIN_CONFIDENCE = 0.9


@dataclass(slots=True)
class Match:
    pattern_id: str
    confidence: float
    start_index: int
    matched_stops: int


def _contiguous(pattern: tuple[str, ...], live: tuple[str, ...]) -> int | None:
    size = len(live)
    for start in range(len(pattern) - size + 1):
        if pattern[start : start + size] == live:
            return start
    return None


def _lcs(pattern: tuple[str, ...], live: tuple[str, ...]) -> tuple[int, int]:
    """Return ``(start_index, length)`` of the longest common subsequence."""
    rows, cols = len(pattern), len(live)
    table = [[0] * (cols + 1) for _ in range(rows + 1)]
    for i in range(rows - 1, -1, -1):
        for j in range(cols - 1, -1, -1):
            if pattern[i] == live[j]:
                table[i][j] = table[i + 1][j + 1] + 1
            else:
                table[i][j] = max(table[i + 1][j], table[i][j + 1])

    start = None
    i = j = 0
    while i < rows and j < cols:
        if pattern[i] == live[j]:
            if start is None:
                start = i
            i += 1
            j += 1
        elif table[i + 1][j] >= table[i][j + 1]:
            i += 1
        else:
            j += 1
    return (0 if start is None else start), table[0][0]


class PatternIndex:
    def __init__(self, graph: dict) -> None:
        self.by_route: dict[str, list[tuple[dict, tuple[str, ...]]]] = {}
        for pattern in graph.get("patterns", []):
            stops = tuple(stop for stop, _ in pattern["stops"])
            if stops:
                self.by_route.setdefault(pattern["route"], []).append((pattern, stops))

    def routes(self) -> list[str]:
        return sorted(self.by_route)

    def pattern(self, pattern_id: str) -> dict | None:
        for patterns in self.by_route.values():
            for pattern, _ in patterns:
                if pattern["id"] == pattern_id:
                    return pattern
        return None

    def match(
        self, route: str | None, stop_ids: list[str], direction: str | None = None
    ) -> Match | None:
        if not route or len(stop_ids) < 2:
            # A single remaining stop says nothing about which pattern this is; the
            # result would be whichever pattern happens to be listed first.
            return None
        live = tuple(stop_ids)
        best: Match | None = None
        best_rank = (-1.0, -1)
        for pattern, stops in self.by_route.get(route, ()):
            if len(stops) < len(live):
                continue
            start = _contiguous(stops, live)
            if start is not None:
                candidate = Match(pattern["id"], 1.0, start, len(live))
                confidence = 1.0
            else:
                start, matched = _lcs(stops, live)
                confidence = matched / len(live)
                candidate = Match(pattern["id"], confidence, start, matched)
            if confidence < MIN_CONFIDENCE:
                continue
            # Confidence first, then direction agreement. MTA stop ids already carry
            # the direction suffix, so the tie-break almost never fires.
            rank = (confidence, 1 if direction and pattern["dir"] == direction else 0)
            if rank > best_rank:
                best_rank = rank
                best = candidate
        return best
