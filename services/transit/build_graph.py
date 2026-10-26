"""Build the track graph from static GTFS and publish it next to the snapshot.

Run weekly (or after a GTFS update):

    python3 -m services.transit.build_graph

Refuses to build from a feed whose service window has expired, so a stale graph
never silently replaces a good one — pass ``--allow-expired`` to override.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path

from . import graph, gtfs_static

log = logging.getLogger("transit.build_graph")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, help="build from this GTFS zip instead of downloading")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(os.environ.get("TRANSIT_DATA_DIR", "/var/lib/transit-archive")),
    )
    parser.add_argument(
        "--www-dir",
        type=Path,
        default=Path(os.environ.get("TRANSIT_WWW_DIR", "/var/www/transit-api")),
    )
    parser.add_argument(
        "--allow-expired",
        action="store_true",
        help="build even if the feed's service window has ended",
    )
    args = parser.parse_args()

    if args.zip:
        path = args.zip
    else:
        path, _ = gtfs_static.download(args.data_dir / "static")
    info = gtfs_static.parse_feed_info(path.read_bytes())
    tables = gtfs_static.read_tables(path, gtfs_static.SMALL_TABLES)

    log.info(
        "static feed %s: version=%s window=%s",
        path.name,
        info.version,
        gtfs_static.window_label(info),
    )
    if info.expired() and not args.allow_expired:
        log.error(
            "refusing to build from an expired feed (%s); update the static feed or pass "
            "--allow-expired",
            gtfs_static.window_label(info),
        )
        raise SystemExit(2)
    if gtfs_static.stale_after(info):
        log.warning("static feed window closes soon: %s", gtfs_static.window_label(info))

    built = graph.build(tables, info.version, source=path)
    manifest = graph.write_artifacts(built, args.www_dir)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
