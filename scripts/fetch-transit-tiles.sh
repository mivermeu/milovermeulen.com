#!/usr/bin/env bash
# Build the NYC basemap archive for apps/transit.
#
#   scripts/fetch-transit-tiles.sh            # newest Protomaps daily build
#   scripts/fetch-transit-tiles.sh 20261026   # a specific build
#
# Requires the pmtiles CLI (Go): `brew install pmtiles`.
# Output is gitignored; upload it to <site>/transit/tiles/ after building.
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUT="$REPO_ROOT/apps/transit/static/tiles/nyc-basemap-z13.pmtiles"
BBOX="-74.45,40.40,-73.45,41.05"

command -v pmtiles >/dev/null || { echo "pmtiles CLI missing: brew install pmtiles" >&2; exit 1; }

candidates=()
if [ $# -ge 1 ]; then
    candidates=("$1")
else
    # Daily builds land late in the day; fall back a few days if today 404s.
    while IFS= read -r day; do candidates+=("$day"); done < <(python3 - <<'PY'
from datetime import date, timedelta
print("\n".join((date.today() - timedelta(days=i)).strftime("%Y%m%d") for i in range(5)))
PY
)
fi

mkdir -p "$(dirname "$OUT")"
for day in "${candidates[@]}"; do
    url="https://build.protomaps.com/${day}.pmtiles"
    echo "extract $url"
    if pmtiles extract "$url" "$OUT" --bbox="$BBOX" --minzoom=10 --maxzoom=13; then
        echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
        exit 0
    fi
    echo "  unavailable, trying an older build" >&2
done

echo "no build found for: ${candidates[*]}" >&2
exit 1
