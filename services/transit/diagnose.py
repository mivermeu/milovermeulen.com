"""Report live join quality against the currently published graph.

    python3 -m services.transit.diagnose

Answers the only question that matters after a graph build: do today's real
trains actually resolve to static patterns, and where do they not?
"""

from __future__ import annotations

import collections
import json
import logging
import os
import time
from pathlib import Path

from . import feeds, graph, gtfs, join

log = logging.getLogger("transit.diagnose")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    www_dir = Path(os.environ.get("TRANSIT_WWW_DIR", "/var/www/transit-api"))
    manifest = graph.load_manifest(www_dir)
    document = graph.load_graph(www_dir)
    if not manifest or not document:
        raise SystemExit("no graph published; run `python3 -m services.transit.build_graph`")

    index = join.PatternIndex(document)
    results = feeds.fetch_all()

    stats: collections.Counter[str] = collections.Counter()
    per_route: dict[str, list[int]] = collections.defaultdict(lambda: [0, 0])
    unmatched: list[tuple[str, str, int]] = []
    short = 0

    for name in feeds.TRIP_FEEDS:
        payload = results[name].payload
        if not payload:
            stats["feed_errors"] += 1
            continue
        try:
            parse = gtfs.parse_feed(payload)
        except gtfs.GtfsRtError as exc:
            log.warning("feed %s unparseable: %s", name, exc)
            stats["feed_errors"] += 1
            continue
        for update in parse.trip_updates:
            stop_ids = [stop.stop_id for stop in update.stop_time_updates if stop.stop_id]
            if not stop_ids:
                stats["no_stops"] += 1
                continue
            if len(stop_ids) < 3:
                short += 1
            stats["trips"] += 1
            match = index.match(update.trip.route_id, stop_ids, gtfs.trip_direction(update.trip))
            route = update.trip.route_id or "?"
            per_route[route][0] += 1
            if match is None:
                stats["unmatched"] += 1
                unmatched.append((route, update.trip.trip_id or "?", len(stop_ids)))
                continue
            stats["matched"] += 1
            per_route[route][1] += 1
            stats[f"confidence_{round(match.confidence, 1)}"] += 1

    total = stats["trips"] or 1
    report = {
        "graph": {
            "hash": manifest.get("hash"),
            "feed_version": manifest.get("feed_version"),
            "built_at": manifest.get("built_at"),
            "age_hours": round((time.time() - manifest.get("built_at", 0)) / 3600, 1),
            "patterns": manifest.get("patterns"),
        },
        "trips": stats["trips"],
        "matched": stats["matched"],
        "matched_pct": round(100 * stats["matched"] / total, 1),
        "unmatched": stats["unmatched"],
        "short_sequences": short,
        "short_sequence_pct": round(100 * short / total, 1),
        "feed_errors": stats["feed_errors"],
        "no_stops": stats["no_stops"],
        "confidence": {
            key.removeprefix("confidence_"): value
            for key, value in sorted(stats.items())
            if key.startswith("confidence_")
        },
        "routes": {
            route: {"trips": seen, "matched_pct": round(100 * hits / seen, 1)}
            for route, (seen, hits) in sorted(per_route.items())
        },
        "unmatched_samples": unmatched[:10],
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
