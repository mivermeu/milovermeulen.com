"""Export per-pattern trajectory history for the train-progress chart.

The inspector compares one selected train's projected path with how trains on
the same pattern actually ran recently. Edge medians are too coarse for that:
the chart needs the shape of the run (dwell, acceleration, hold) aligned at the
train's current position.

So this streams the series tier, collapses each train into a run, resamples it
onto a 30 s grid, and writes one small file per pattern:

    history-v2-<graph>-<pattern>.json
    {"v":1,"pattern":"L-...","runs":[{"start":…,"h":14,"w":0,"dt":30,"s":[…]}]}

The client fetches only the selected train's pattern, filters runs by
time-of-day, aligns each one at the current distance, and draws the p10-p90
band. Files are content-addressed by the graph hash and old hashes are pruned.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
from collections import defaultdict
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from . import learn

log = logging.getLogger("transit.history")

SCHEMA_VERSION = 2
DEFAULT_DAYS = 21
SAMPLE_DT = 30
# A run shorter than this says nothing about progression.
MIN_POINTS = 10
MIN_DURATION_S = 300
MIN_SPAN_M = 600
# A gap longer than this is a new run, not the same train.
GAP_S = 300
# A backwards jump larger than this is a reversal or a new trip. Smaller
# corrections are position noise and must not split a run.
REVERSAL_M = 1500
# Enough to fill a band without shipping every run ever seen.
MAX_RUNS = 40
LOCAL_ZONE = ZoneInfo("America/New_York")


def _quantile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def _crossing(values: list[float], run: dict[str, Any], distance: float) -> float | None:
    if distance < values[0] or distance > values[-1]:
        return None
    low, high = 0, len(values) - 1
    while low < high:
        middle = (low + high) // 2
        if values[middle] < distance:
            low = middle + 1
        else:
            high = middle
    if low == 0:
        return float(run["start"])
    before, after = values[low - 1], values[low]
    fraction = (distance - before) / (after - before) if after > before else 0.0
    return run["start"] + (low - 1 + fraction) * run["dt"]


def _stop_times(
    run: dict[str, Any], stops: list[float]
) -> tuple[list[float | None], list[float | None]]:
    """Arrival and departure time at each stop.

    Departure is the crossing of 15 m past the platform. Run time must be
    departure-to-arrival: the chart already knows the phase since departure, and
    an arrival-to-arrival total would make every band one dwell too slow.
    """
    values: list[float] = []
    best = -1e18
    for value in run["s"]:
        best = max(best, float(value))
        values.append(best)
    arrivals: list[float | None] = []
    departures: list[float | None] = []
    for distance in stops:
        arrival = _crossing(values, run, distance)
        arrivals.append(arrival)
        departure = _crossing(values, run, distance + 15)
        if departure is not None and arrival is not None:
            departures.append(max(arrival, departure))
        else:
            departures.append(arrival)
    return arrivals, departures


def _resample(points: list[tuple[int, float]]) -> list[int] | None:
    """Resample one run onto a fixed grid; None when it is too short or static."""
    if len(points) < MIN_POINTS:
        return None
    first_t, first_s = points[0]
    last_t, last_s = points[-1]
    if last_t - first_t < MIN_DURATION_S or abs(last_s - first_s) < MIN_SPAN_M:
        return None
    samples: list[int] = []
    index = 0
    target = first_t
    while target <= last_t:
        while index + 1 < len(points) and points[index + 1][0] < target:
            index += 1
        if index + 1 >= len(points):
            break
        ta, sa = points[index]
        tb, sb = points[index + 1]
        value = sa if tb <= ta else sa + (sb - sa) * (target - ta) / (tb - ta)
        samples.append(round(value))
        target += SAMPLE_DT
    return samples if len(samples) >= MIN_POINTS else None


def runs_from_rows(rows: Iterator[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse observation rows into resampled runs with local-time metadata."""
    runs: list[dict[str, Any]] = []
    active: dict[str, dict[str, Any]] = {}

    def flush(train: str) -> None:
        state = active.pop(train, None)
        if not state:
            return
        samples = _resample(state["points"])
        if not samples:
            return
        start = state["points"][0][0]
        local = datetime.fromtimestamp(start, LOCAL_ZONE)
        runs.append(
            {
                "pattern": state["pattern"],
                "start": int(start),
                "h": local.hour,
                "w": 0 if local.weekday() < 5 else 1,
                "dt": SAMPLE_DT,
                "s": samples,
            }
        )

    for row in rows:
        if row.get("pre") or row.get("pattern") is None or row.get("s") is None:
            # A missing position in the middle of a trip is an observation gap,
            # not a trip boundary; the gap check below closes it if it persists.
            continue
        train = row.get("id")
        if not train:
            continue
        pattern = row["pattern"]
        trip = row.get("trip")
        stamp = row.get("t")
        distance = row.get("s")
        if not isinstance(stamp, int) or not isinstance(distance, (int, float)):
            flush(train)
            continue
        state = active.get(train)
        if (
            state is None
            or state["pattern"] != pattern
            or (
                trip is not None
                and state["trip"] is not None
                and trip != state["trip"]
            )
            or stamp - state["last"] > GAP_S
            or distance < state["last_s"] - REVERSAL_M
        ):
            flush(train)
            active[train] = {
                "pattern": pattern,
                "trip": trip,
                "points": [(stamp, float(distance))],
                "last": stamp,
                "last_s": float(distance),
            }
        else:
            state["points"].append((stamp, float(distance)))
            state["last"] = stamp
            state["last_s"] = float(distance)
    for train in list(active):
        flush(train)
    return runs


def build(
    paths: list[Path],
    graph_hash: str,
    now: float | None = None,
    max_runs: int = MAX_RUNS,
    stops_by_pattern: dict[str, list[float]] | None = None,
) -> dict[str, dict[str, Any]]:
    stamp = int(time.time() if now is None else now)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    edge_samples: dict[tuple[str, str, int], list[float]] = defaultdict(list)
    dwell_samples: dict[tuple[str, int], list[float]] = defaultdict(list)
    total = 0
    for run in runs_from_rows(learn.iter_rows(paths)):
        grouped[run["pattern"]].append(run)
        total += 1
        stops = (stops_by_pattern or {}).get(run["pattern"])
        if not stops:
            continue
        arrivals, departures = _stop_times(run, stops)
        kind = "weekend" if run["w"] else "weekday"
        for index in range(len(stops) - 1):
            departure = departures[index]
            arrival = arrivals[index + 1]
            if departure is None or arrival is None:
                continue
            duration = arrival - departure
            if 5.0 <= duration <= 1800.0:
                edge_samples[(run["pattern"], kind, index)].append(duration)
                edge_samples[(run["pattern"], "all", index)].append(duration)
        for index in range(len(stops)):
            arrival = arrivals[index]
            departure = departures[index]
            if arrival is None or departure is None:
                continue
            dwell = departure - arrival
            if 0.0 <= dwell <= 600.0:
                dwell_samples[(run["pattern"], index)].append(dwell)
    documents: dict[str, dict[str, Any]] = {}
    for pattern, runs in grouped.items():
        runs.sort(key=lambda run: run["start"], reverse=True)
        kept = sorted(runs[:max_runs], key=lambda run: run["start"])
        stops = (stops_by_pattern or {}).get(pattern) or []
        edges: dict[str, list[list[float] | None]] = {"all": [], "weekday": [], "weekend": []}
        for index in range(max(0, len(stops) - 1)):
            overall = edge_samples.get((pattern, "all", index), [])
            if len(overall) < 5:
                edges["all"].append(None)
                edges["weekday"].append(None)
                edges["weekend"].append(None)
                continue
            quantiles = [_quantile(overall, p) for p in (0.1, 0.5, 0.9)]
            edges["all"].append([round(value, 1) for value in quantiles])
            for kind in ("weekday", "weekend"):
                sample = edge_samples.get((pattern, kind, index), [])
                if len(sample) >= 5:
                    edges[kind].append(
                        [round(_quantile(sample, p), 1) for p in (0.1, 0.5, 0.9)]
                    )
                else:
                    edges[kind].append([round(value, 1) for value in quantiles])
        dwells = []
        for index in range(len(stops)):
            sample = dwell_samples.get((pattern, index), [])
            dwells.append(round(_quantile(sample, 0.5), 1) if sample else 0.0)
        documents[pattern] = {
            "v": SCHEMA_VERSION,
            "pattern": pattern,
            "graph": graph_hash,
            "built_at": stamp,
            "edges": edges,
            "dwells": dwells,
            "runs": kept,
        }
    log.info(
        "history: %d runs across %d patterns (kept %d each)",
        total,
        len(documents),
        max_runs,
    )
    return documents


def write_artifacts(
    documents: dict[str, dict[str, Any]], www_dir: Path, graph_hash: str
) -> int:
    www_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for pattern, document in documents.items():
        path = www_dir / f"history-v{SCHEMA_VERSION}-{graph_hash}-{pattern}.json"
        payload = json.dumps(document, separators=(",", ":")).encode("utf-8")
        temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        temporary.write_bytes(payload)
        os.replace(temporary, path)
        written += 1
    # History is derived; only the current schema and graph are useful.
    keep = f"history-v{SCHEMA_VERSION}-{graph_hash}-"
    for stale in www_dir.glob("history-*.json"):
        if not stale.name.startswith(keep):
            stale.unlink(missing_ok=True)
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=None)
    parser.add_argument("--www-dir", type=Path, default=None)
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS)
    parser.add_argument("--max-runs", type=int, default=MAX_RUNS)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    data_dir = args.data_dir or Path(os.environ.get("TRANSIT_DATA_DIR", "/var/lib/transit-archive"))
    www_dir = args.www_dir or Path(os.environ.get("TRANSIT_WWW_DIR", "/var/www/transit-api"))
    manifest = json.loads((www_dir / "graph.json").read_text())
    graph = json.loads((www_dir / manifest["graph"]).read_text())
    stops_by_pattern = {
        pattern["id"]: [float(distance) for _, distance in pattern["stops"]]
        for pattern in graph.get("patterns", [])
    }
    paths = learn.series_paths(data_dir, args.days)
    if not paths:
        log.error("no series files under %s", data_dir / "series")
        return 1
    documents = build(
        paths, manifest["hash"], max_runs=args.max_runs, stops_by_pattern=stops_by_pattern
    )
    if args.dry_run:
        return 0
    written = write_artifacts(documents, www_dir, manifest["hash"])
    log.info("wrote %d history files for %s", written, manifest["hash"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
