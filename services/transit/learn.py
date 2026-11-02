"""Fit per-edge run times from the observation archive.

The feed never reports a train between stations, so the only run-time signal is
the interval between first seeing a train at one stop and first seeing it at the
next. That interval is arrival-to-arrival (it includes the origin dwell) and it
is quantised by the sample interval, but its *expectation* is unbiased: the
arrival-time error at each end is the same distribution, so it cancels.

This module streams the series files (one row per train per sample), collapses
them into stop visits, and publishes a content-addressed ``runtime-<graph>.json``:

* per directed edge, the median station-to-station time and its sample count;
* a weekday/weekend by hour multiplier, so peak-hour running is not smeared into
  an all-day average.

The estimator treats this as a prior and still prefers the trip's own realtime
arrival prediction when it has one. Edges with too few samples are omitted; the
graph's scheduled run time is the fallback.

Run weekly (``transit-learn.timer``). Reading is streaming and bounded: about
two million transitions for a fortnight, regardless of archive size.
"""

from __future__ import annotations

import argparse
import gzip
import json
import logging
import os
import statistics
import time
from array import array
from collections import defaultdict
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

log = logging.getLogger("transit.learn")

SCHEMA_VERSION = 1
DEFAULT_DAYS = 14
# Fewer than this and the median is noise; fall back to the schedule.
MIN_SAMPLES = 5
# A "visit" longer than this is a layover, not a dwell, and would inflate the
# station-to-station interval.
MAX_VISIT_S = 240
# Sanity bounds for one edge traversal.
MIN_EDGE_S = 15
MAX_EDGE_S = 1800
# The hour multiplier is a correction, not a rewrite.
MIN_FACTOR = 0.85
MAX_FACTOR = 1.2

LOCAL_ZONE = ZoneInfo("America/New_York")


def series_paths(data_dir: Path, days: int) -> list[Path]:
    paths = sorted((data_dir / "series").glob("*.jsonl.gz"))
    return paths[-days:] if days > 0 else paths


def iter_rows(paths: list[Path]) -> Iterator[dict[str, Any]]:
    """Yield rows in file order. A truncated newest member ends that file."""
    for path in paths:
        try:
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                for line in handle:
                    try:
                        yield json.loads(line)
                    except json.JSONDecodeError:
                        continue
        except (EOFError, OSError) as exc:
            log.warning("stopping at a damaged series member %s: %s", path.name, exc)


def _stop_indexes(document: dict[str, Any]) -> dict[str, dict[str, int]]:
    return {
        pattern["id"]: {stop: index for index, (stop, _) in enumerate(pattern["stops"])}
        for pattern in document.get("patterns", [])
    }


def _scheduled_dwell(document: dict[str, Any], pattern: str, edge: int) -> float:
    for row in document.get("patterns", []):
        if row["id"] != pattern:
            continue
        times = row.get("edge_times") or []
        if edge < len(times):
            return float(times[edge][1])
    return 0.0


def collect(
    rows: Iterator[dict[str, Any]],
    document: dict[str, Any],
) -> dict[tuple[str, int], tuple[array, array]]:
    """Collapse observations into per-edge arrival-to-arrival samples."""
    indexes = _stop_indexes(document)
    # (pattern, index) -> (sample unix times, sample seconds)
    samples: dict[tuple[str, int], tuple[array, array]] = defaultdict(
        lambda: (array("i"), array("f"))
    )
    active: dict[str, dict[str, Any]] = {}

    for row in rows:
        if row.get("pre"):
            continue
        pattern = row.get("pattern")
        stop = row.get("stop")
        stamp = row.get("t")
        if not pattern or not stop or not isinstance(stamp, int):
            active.pop(row.get("id"), None)
            continue
        lookup = indexes.get(pattern)
        if lookup is None:
            continue
        index = lookup.get(stop)
        if index is None:
            continue

        train = row.get("id")
        state = active.get(train)
        if state is None or state["pattern"] != pattern:
            active[train] = {"pattern": pattern, "index": index, "first": stamp, "last": stamp}
            continue

        if index == state["index"]:
            state["last"] = stamp
            continue

        if index == state["index"] + 1 and stamp > state["first"]:
            lived = state["last"] - state["first"]
            interval = stamp - state["first"]
            if lived <= MAX_VISIT_S and MIN_EDGE_S <= interval <= MAX_EDGE_S:
                times, values = samples[(pattern, state["index"])]
                times.append(stamp)
                values.append(interval)
            active[train] = {"pattern": pattern, "index": index, "first": stamp, "last": stamp}
            continue

        # A skipped stop, a reversal or a short-turn: start a fresh visit rather
        # than inventing an edge that was never observed.
        active[train] = {"pattern": pattern, "index": index, "first": stamp, "last": stamp}

    return samples


def _median(values: array) -> float:
    return float(statistics.median(values)) if values else 0.0


def fit(
    paths: list[Path],
    document: dict[str, Any],
    graph_hash: str,
    now: float | None = None,
    min_samples: int = MIN_SAMPLES,
) -> dict[str, Any]:
    stamp = time.time() if now is None else now
    samples = collect(iter_rows(paths), document)

    edges: dict[str, list[list[Any]]] = {}
    hour_values: dict[tuple[int, int], array] = {
        (kind, hour): array("f") for kind in (0, 1) for hour in range(24)
    }
    rows = 0

    for pattern in document.get("patterns", []):
        pattern_id = pattern["id"]
        count = max(0, len(pattern["stops"]) - 1)
        row: list[list[Any]] = []
        for edge in range(count):
            times, values = samples.get((pattern_id, edge), (array("i"), array("f")))
            rows += len(values)
            if len(values) < min_samples:
                row.append([None, len(values)])
                continue
            median = _median(values)
            run = max(5.0, median - _scheduled_dwell(document, pattern_id, edge))
            row.append([round(run, 1), len(values)])
            for capture, value in zip(times, values, strict=False):
                local = datetime.fromtimestamp(capture, LOCAL_ZONE)
                kind = 0 if local.weekday() < 5 else 1
                hour_values[(kind, local.hour)].append(value / median)
        edges[pattern_id] = row

    hour_factor: list[list[float]] = []
    for kind in (0, 1):
        factors = []
        for hour in range(24):
            values = hour_values[(kind, hour)]
            factor = _median(values) if len(values) >= 20 else 1.0
            factors.append(round(min(MAX_FACTOR, max(MIN_FACTOR, factor)), 3))
        hour_factor.append(factors)

    return {
        "v": SCHEMA_VERSION,
        "graph": graph_hash,
        "built_at": int(stamp),
        "days": len(paths),
        "samples": rows,
        "min_samples": min_samples,
        "edges": edges,
        "hour_factor": hour_factor,
    }


def write(artifact: dict[str, Any], www_dir: Path) -> Path:
    name = f"runtime-{artifact['graph']}.json"
    payload = json.dumps(artifact, separators=(",", ":")).encode("utf-8")
    www_dir.mkdir(parents=True, exist_ok=True)
    path = www_dir / name
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_bytes(payload)
    os.replace(temporary, path)
    return path


def load(www_dir: Path, graph_hash: str | None) -> dict[str, Any] | None:
    if not graph_hash:
        return None
    path = www_dir / f"runtime-{graph_hash}.json"
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=None)
    parser.add_argument("--www-dir", type=Path, default=None)
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS)
    parser.add_argument("--min-samples", type=int, default=MIN_SAMPLES)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    data_dir = args.data_dir or Path(os.environ.get("TRANSIT_DATA_DIR", "/var/lib/transit-archive"))
    www_dir = args.www_dir or Path(os.environ.get("TRANSIT_WWW_DIR", "/var/www/transit-api"))

    manifest = json.loads((www_dir / "graph.json").read_text())
    document = json.loads((www_dir / manifest["graph"]).read_text())
    paths = series_paths(data_dir, args.days)
    if not paths:
        log.error("no series files under %s", data_dir / "series")
        return 1

    artifact = fit(paths, document, manifest["hash"], min_samples=args.min_samples)
    covered = sum(1 for row in artifact["edges"].values() for run, _ in row if run is not None)
    log.info(
        "learned %d edges from %d samples over %d files (%.0f%% of %d)",
        covered,
        artifact["samples"],
        len(paths),
        covered / max(1, sum(len(row) for row in artifact["edges"].values())) * 100,
        sum(len(row) for row in artifact["edges"].values()),
    )
    if args.dry_run:
        return 0
    path = write(artifact, www_dir)
    log.info("wrote %s", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
