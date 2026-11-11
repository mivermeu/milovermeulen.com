"""Export per-pattern trajectory history for the train-progress chart.

The inspector compares one selected train's projected path with how trains on
the same pattern actually ran recently. Edge medians are too coarse for that:
the chart needs the shape of the run (dwell, acceleration, hold) aligned at the
train's current position.

So this streams the series tier, collapses each train into a run, resamples it
onto a 30 s grid, and writes one small file per pattern:

    history-<graph>-<pattern>.json
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

SCHEMA_VERSION = 1
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
) -> dict[str, dict[str, Any]]:
    stamp = int(time.time() if now is None else now)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    total = 0
    for run in runs_from_rows(learn.iter_rows(paths)):
        grouped[run["pattern"]].append(run)
        total += 1
    documents: dict[str, dict[str, Any]] = {}
    for pattern, runs in grouped.items():
        runs.sort(key=lambda run: run["start"], reverse=True)
        kept = sorted(runs[:max_runs], key=lambda run: run["start"])
        documents[pattern] = {
            "v": SCHEMA_VERSION,
            "pattern": pattern,
            "graph": graph_hash,
            "built_at": stamp,
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
        path = www_dir / f"history-{graph_hash}-{pattern}.json"
        payload = json.dumps(document, separators=(",", ":")).encode("utf-8")
        temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        temporary.write_bytes(payload)
        os.replace(temporary, path)
        written += 1
    # History is derived and only the current graph's files are useful.
    keep = f"-{graph_hash}-"
    for stale in www_dir.glob("history-*.json"):
        if keep not in stale.name:
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
    paths = learn.series_paths(data_dir, args.days)
    if not paths:
        log.error("no series files under %s", data_dir / "series")
        return 1
    documents = build(paths, manifest["hash"], max_runs=args.max_runs)
    if args.dry_run:
        return 0
    written = write_artifacts(documents, www_dir, manifest["hash"])
    log.info("wrote %d history files for %s", written, manifest["hash"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
