# Transit service

Polls MTA GTFS-RT, archives every payload, and publishes one merged snapshot for the transit
frontend. Part of the `services/` root — a long-running process, not a static site, so it is
deployed by hand rather than over FTPS.

Zero external dependencies: the protobuf decoder is a small wire reader in `gtfs.py`. That keeps the
service runnable with nothing but `python3.12`, and lets us read the NYCT extensions (`train_id`,
`scheduled_track`/`actual_track`) that `gtfs-realtime-bindings` does not ship.

## What one cycle does

1. Fetches all nine endpoints concurrently (8 route-group feeds + alerts), 10 s timeout, one retry.
2. Validates the protobuf header. Unparseable payloads go to `bad/` and never reach the snapshot.
3. Archives the raw bytes, byte-exact, gzipped.
4. Merges trips + vehicles into `snapshot.json` and writes it atomically.
5. Appends one series row per train and one metadata row per cycle.
6. Prunes old files by mtime.

A failed feed never aborts the cycle: it is reported per feed in the snapshot, so the frontend can
show "L data unavailable" instead of silently losing a quarter of the map.

## Running locally

```bash
# from the repo root
TRANSIT_DATA_DIR=/tmp/transit-data TRANSIT_WWW_DIR=/tmp/transit-www \
  python3.12 -m services.transit.poller
```

One cycle only, without the loop:

```python
from pathlib import Path
from services.transit.poller import Config, Poller

Poller(Config(data_dir=Path("/tmp/transit-data"), www_dir=Path("/tmp/transit-www"))).tick()
```

Serve the result:

```bash
TRANSIT_WWW_DIR=/tmp/transit-www TRANSIT_API_PORT=8082 \
  python3.12 -m services.transit.server
curl -s localhost:8082/snapshot.json | head -c 400
curl -s localhost:8082/health
```

## Configuration

| Variable                | Default                    | Meaning                                           |
| ----------------------- | -------------------------- | ------------------------------------------------- |
| `TRANSIT_DATA_DIR`      | `/var/lib/transit-archive` | archive root                                      |
| `TRANSIT_WWW_DIR`       | `/var/www/transit-api`     | where `snapshot.json` is written and served from  |
| `TRANSIT_INTERVAL`      | `30`                       | seconds between cycles (MTA refreshes ~30 s)      |
| `TRANSIT_HTTP_TIMEOUT`  | `10`                       | per-feed fetch timeout                            |
| `TRANSIT_RAW_HOURS`     | `48`                       | raw ring retention                                |
| `TRANSIT_SERIES_DAYS`   | `90`                       | series and metadata retention                     |
| `TRANSIT_SERIES_EVERY`  | `2`                        | write series rows every N cycles (2 = 60 s)       |
| `TRANSIT_BAD_DAYS`      | `7`                        | retention for quarantined payloads                |
| `TRANSIT_PRUNE_SECONDS` | `3600`                     | prune at most once per hour                       |
| `TRANSIT_STALE_AFTER`   | `120`                      | `/health` reports `stale` after this many seconds |
| `TRANSIT_API_HOST`      | `127.0.0.1`                | API bind address                                  |
| `TRANSIT_API_PORT`      | `8082`                     | API port                                          |

## Archive layout

```
$TRANSIT_DATA_DIR/
  raw/2026-10-26/01/gtfs-g-1792978330000.pb.gz   byte-exact payloads, 48 h
  series/2026-10-26.jsonl.gz                     one row per train per 60 s, 90 d
  meta/2026-10-26.jsonl                          one row per cycle: status, latency, bytes
  bad/2026-10-26/gtfs-g-...-truncated-varint.pb  quarantined payloads, 7 d
```

Files, not a database: retention is `rm` by mtime, and the day files are directly queryable with
DuckDB or pandas when analysis starts. The raw tier is the only thing that can re-derive history
after a parser change; the series tier is what becomes the run-time/dwell training set.

Series files are multi-member gzip: each cycle appends one complete member in a single write, so a
reader (or a crash) never sees a half-written row. A crash _during_ that write can still truncate
the newest member, so analysis readers should stop at the first bad member rather than assume the
day file is whole.

Measured steady state is roughly **2.3 GB**: ~0.8 GB of raw for 48 h (alerts are the bulk of each
cycle), ~1–1.5 GB of series for 90 days at 60 s, and ~65 MB of metadata.

## Snapshot schema (v0)

Stop-level on purpose, so the service can ship before the track graph exists. v1 will add
`edge`/`s`/`v`/`confidence` additively.

```json
{
    "v": 0,
    "generated_at": 1792978330,
    "header_ts": 1792978300,
    "feeds": {
        "gtfs-g": {
            "ok": true,
            "status": 200,
            "age_s": 3,
            "trips": 20,
            "vehicles": 20,
            "alerts": 0
        }
    },
    "trains": [
        {
            "id": "1G 2121+ CRS/BDN",
            "trip": "128150_G..S15X004",
            "route": "G",
            "dir": "S",
            "start_date": "20261025",
            "status": "STOPPED_AT",
            "stop": "G29S",
            "seq": 4,
            "vehicle_ts": 1792978290,
            "next": [{ "stop": "G24S", "arr": 1792978362, "dep": 1792978382 }]
        }
    ],
    "alerts": [
        {
            "id": "lmm:alert:...",
            "effect": null,
            "cause": null,
            "header": "...",
            "routes": ["F"],
            "stops": []
        }
    ]
}
```

Notes:

- `status` comes from the vehicle entity (`INCOMING_AT` / `STOPPED_AT` / `IN_TRANSIT_TO`) and is the
  authority on where a train is now. When MTA omits it, GTFS-RT's default applies, so it reads
  `IN_TRANSIT_TO` rather than `null`.
- `dir` prefers the NYCT `direction` extension (1=N, 2=E, 3=S, 4=W) but MTA omits it for northbound
  trips, so we fall back to the direction marker in the trip id (`128150_G..S15X004` → S). EAST/WEST
  are documented as unused.
- `trains` holds only trips that have a vehicle entity — an observed position to place. Trips in the
  feed that are scheduled but not assigned are counted in `scheduled_trips` instead; rendering those
  would park them at the origin terminal.
- `next` is capped at three stops for the render path. The first entry is often the stop the train
  is currently at, so its time can be a few seconds in the past: it is the feed's timeline, not a
  set of strictly future stops. Per-train detail belongs in a separate endpoint later.
- `effect`/`cause` are usually `null`: MTA leaves them unset, so alert severity has to be derived
  from text. `routes`/`stops` (from `informed_entity`) are the reliable structure.
- MTA publishes no lat/lon anywhere in this feed. v0 has no positions; the frontend derives them
  once the track graph lands.

## Deployment

```bash
cd services/transit
sudo useradd --system --home /var/lib/transit-archive --shell /usr/sbin/nologin transit
sudo mkdir -p /var/lib/transit-archive /var/www/transit-api
sudo chown transit:transit /var/lib/transit-archive /var/www/transit-api
sudo install -m 644 systemd/transit-poller.service systemd/transit-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now transit-poller.service transit-api.service
journalctl -u transit-poller -f
```

Both units run as the `transit` user and assume the repo is checked out at
`/path/to/milovermeulen.com`; adjust `WorkingDirectory` and the `ExecStart` python path if not. The
nginx vhost in `deploy/nginx.conf` already has a commented `location /transit/` block — uncomment it
once the API is running so `/transit/snapshot.json` resolves.

## Tests

```bash
python3.12 -m pytest services/transit/tests -q
ruff check services
```

Fixtures in `tests/fixtures/` are real captured feeds, which is what pins the wire format and the
NYCT extension numbers. `truncated.pb` is a deliberately cut payload used to prove quarantine works.
