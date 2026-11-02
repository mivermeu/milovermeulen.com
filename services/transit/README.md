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
5. Appends one series row per train, one events row per stop transition, and one metadata row per
   cycle.
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
| `TRANSIT_SERIES_DAYS`   | `180`                      | series retention                                  |
| `TRANSIT_META_DAYS`     | `365`                      | metadata retention                                |
| `TRANSIT_SERIES_EVERY`  | `2`                        | write series rows every N cycles (2 = 60 s)       |
| `TRANSIT_BAD_DAYS`      | `7`                        | retention for quarantined payloads                |
| `TRANSIT_PRUNE_SECONDS` | `3600`                     | prune at most once per hour                       |
| `TRANSIT_STALE_AFTER`   | `120`                      | `/health` reports `stale` after this many seconds |
| `TRANSIT_API_HOST`      | `127.0.0.1`                | API bind address                                  |
| `TRANSIT_API_PORT`      | `8082`                     | API port (this host's unit overrides to `8083`)   |

## Archive layout

```
$TRANSIT_DATA_DIR/
  raw/2026-10-26/01/gtfs-g-1792978330000.pb.gz   byte-exact payloads, 48 h
  series/2026-10-26.jsonl.gz                     one row per train per 60 s, 180 d
  events/2026-10-26.jsonl.gz                     one row per stop transition, forever
  meta/2026-10-26.jsonl                          one row per cycle: status, latency, bytes, 365 d
  bad/2026-10-26/gtfs-g-...-truncated-varint.pb  quarantined payloads, 7 d
```

Files, not a database: retention is `rm` by mtime, and the day files are directly queryable with
DuckDB or pandas when analysis starts. The raw tier is the only thing that can re-derive history
after a parser change.

**Series row** (`v: 2`) — one per observed train per sample:

```json
{
    "v": 2,
    "t": 1792980000,
    "id": "1R 2104",
    "trip": "…",
    "start": "20261027",
    "route": "R",
    "dir": "S",
    "st": "STOPPED_AT",
    "stop": "R16N",
    "seq": 12,
    "feed": "gtfs-nqrw",
    "vehicle_ts": 1792979995,
    "pre": false,
    "pattern": "R-abc",
    "edge": 9,
    "s": 8125.4,
    "speed": 0.0,
    "conf": 0.97,
    "stale": false,
    "reset": false,
    "graph": "ae12bb22cb7b",
    "next": [["R16N", 1792980060, 1792980090], "… up to 6 stops"]
}
```

`t` is our poll time and `vehicle_ts` the feed's observation time, stored raw (it can sit ahead of
our clock). Positions are along-track (`pattern` + `edge` + `s`) rather than lat/lon: comparable
across trains, and projectable later against the graph named by `graph`. `conf`/`stale`/`reset`
exist so bad samples can be filtered out of training.

**Events** — one row per stop transition, the label tier:

```json
{
    "v": 1,
    "t_lo": 1792980000,
    "t_hi": 1792980030,
    "kind": "arrive",
    "id": "1R 2104",
    "trip": "…",
    "start": "20261027",
    "route": "R",
    "stop": "R16N",
    "seq": 12,
    "source": "status",
    "predicted_at": 1792980060,
    "vehicle_ts": 1792980025,
    "feed": "gtfs-nqrw",
    "conf": 0.97
}
```

Kinds: `arrive`, `depart`, `skip`, `trip_end`, `disappeared`, `cancel`. `t_lo`/`t_hi` bracket the
transition between two polls; `source` is `status` (unbiased), `seq` (fallback when the dwell fell
between polls, biased late by it), `schedule` (a cancellation), `trip_change` or `absence`. Brackets
spanning a restart, a failed cycle or a feed outage are dropped, and a train absent for more than 90
s emits exactly one `trip_end`/`disappeared`.

Series and events are never re-derived after the fact: the events tier is the training set, so it is
kept forever while the series is the bigger, replaceable tier.

Placeholders produce no events: a transition into or out of a placeholder is an observation gap, not
a movement. The first real observation of a trip is its event boundary.

Schema note: `v: 1` rows predate placeholders and carry `st: "IN_TRANSIT_TO"` with `seq: null`; use
`seq is null` (or `v == 1`) to identify them. `v: 2` rows carry `pre` and a null status.

Series files are multi-member gzip: each cycle appends one complete member in a single write, so a
reader (or a crash) never sees a half-written row. A crash _during_ that write can still truncate
the newest member, so analysis readers should stop at the first bad member rather than assume the
day file is whole.

Measured steady state (gzipped): raw ~0.9 GB per 48 h (alerts are the bulk of each cycle); series
~62 B/row × ~500 rows/min ≈ **1.3 GB per 30 days** (≈8 GB at 180 days); meta ~505 B/row × 2880/day ≈
**0.5 GB per year**; events ~24 B/row × ~450k rows/day ≈ **4 GB per year**. Superseded graph
artifacts are kept (the `graph` field above points at them), ~1.5 MB per weekly rebuild (~78
MB/year).

## Snapshot schema (v1)

v0 was stop-level; v1 adds the estimated position along the track graph (`pattern`, `edge`, `s`,
`v`, `confidence`) additively, so a v0 reader keeps working.

```json
{
    "v": 1,
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
    "scheduled_trips": 58,
    "predeparture": 82,
    "estimated": 238,
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
            "next": [{ "stop": "G24S", "arr": 1792978362, "dep": 1792978382 }],
            "pattern": "G-4f2a1c9b3e",
            "edge": "G-4f2a1c9b3e:4:G29S>G24S",
            "s": 0.0,
            "v": 11.2,
            "confidence": 0.95,
            "stale": false,
            "reset": false,
            "pre": false
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
- `edge` names the pattern and the segment (`pattern:index:from>to`); `s` is metres from the start
  of that edge and `v` is metres per second. Lat/lon is the frontend's job: slice `shapes.bin` by
  the pattern's stop distances.
- `pre: true` means the feed made no position claim for this trip yet: no stop sequence and no
  status. These are trains that have not started service. They keep their `status`/`stop` for
  compatibility but have no `edge`, no `confidence` and no events until the first real observation.
  `predeparture` counts them at the document level.
- `confidence` folds in match quality, vehicle staleness and whether the observation forced a reset.
  It is not a measure of how far the train moved.
- `reset: true` means the target jumped further than a train could travel in that cycle (re-route,
  restart, bad placement), so the position was re-anchored. Fade it rather than animating the jump.
  A _pattern_ change (short-turn) re-anchors silently with `reset: false`.
- Trains with `edge: null` had no pattern match; they still carry `status`/`stop`, so the map can
  show them at the platform with `confidence: 0`.

## Position estimation

`estimator.py` keys state by NYCT `train_id`, not `trip_id`, so a short-turn (same train, new trip)
continues instead of jumping. Each cycle it:

1. drops placeholders (no sequence and no status) before doing any work — they get no position, so
   `estimated` counts only real observations;
2. joins the trip to a pattern by stop sequence;
3. turns the observation into a target distance along the shape — the stop itself for `STOPPED_AT`,
   between the previous and next stop for `IN_TRANSIT_TO`, with the ETA implying the speed for the
   rest of the segment;
4. advances the previous estimate and corrects it towards the target with a 5 s time constant. At
   the 30 s poll cadence that constant makes the correction effectively immediate (`α ≈ 0.9975`); it
   only smooths when ticks are closer together. The observation leads, the prediction is a prior;
5. caps movement at 30 m/s, and re-anchors (with `reset`) only when the error exceeds what a train
   could cover in the cycle — `600 m + 30 m/s × elapsed`. A train observed `STOPPED_AT` always
   reports `v: 0`; a correction is not current speed.

Lat/lon for a train is `stops[edge_index].dist + s` along its pattern's shape; `s_total` is included
so a client does not need to re-derive it.

A timestamp more than 60 s ahead of the poll clock halves confidence for observed trains: a future
claim is not freshness. The `series` row carries the same observation raw, with `pre` marking
placeholders and `st: null` whenever the feed omitted the status.

Placeholder share and the share not at the trip's first stop are recorded in the per-cycle meta
(`placeholders`, `placeholder_share`, `placeholders_off_origin`); a share above 0.55 logs a warning
(the measured worst is 0.49, overnight), because the predicate depends on MTA continuing to omit
both fields for pre-departure trains.

## Track graph

Static schedules do not join to realtime by trip id: MTA prefixes static ids
(`ASP26GEN-1038-Sunday-00_080750_1..S03R`) while realtime uses `080750_1..S04R`, and the patterns
drift. Measured live: **0%** on trip id, ~**90%** on route + ordered stop sequence (90.6% on
2026-10-26 23:20; single-stop sequences are excluded, since they match by accident). So the graph
keys on patterns and the join scores stop-sequence overlap.

```bash
python3.12 -m services.transit.build_graph   # download, build, publish
python3.12 -m services.transit.diagnose      # live join report
```

`build_graph` uses `gtfs_supplemented.zip` — the feed realtime actually runs (19.6 MB, 79,889 trips)
— versions every download by checksum under `$TRANSIT_DATA_DIR/static/`, and refuses to build when
the service window has expired (`--allow-expired` overrides).

| File                | Contents                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `graph.json`        | manifest: current hash, feed version, counts                                                                     |
| `graph-<hash>.json` | 496 stations, 992 platforms, 257 patterns with ordered stops and distance along the shape                        |
| `shapes-<hash>.bin` | little-endian float32 lat/lon pairs; `offset` in the graph is a **float index** — ×4 for bytes, ×8 for one point |
| `audit.json`        | worst platform-to-shape distances, ranked                                                                        |

Hashed files are served `immutable`; the manifest is short-cached, so a rebuild is picked up without
a redeploy.

### Projection and audit

Neither static feed carries `shape_dist_traveled`, so each platform is projected onto its pattern's
shape (haversine length, local planar projection), constrained to be monotonic along the trip — that
constraint is what keeps doubled-back shapes sane.

The build streams `stop_times.txt` and `shapes.txt` (2.3M and 150k rows) instead of loading them as
dicts: peak RSS is ~350 MB and the whole build takes ~6 s. 14,109 trips in the current feed carry no
`shape_id` and are counted in the log rather than guessed at.

## Deployment

One command from the repo root:

```bash
deploy/install-service.sh transit --enable --nginx
sudo systemctl start transit-graph.service   # first graph build
journalctl -u transit-poller -f
```

The installer is idempotent. It runs this service's tests, copies the package to
`/opt/milovermeulen/services/transit`, creates the `transit` user and both data directories if they
are missing, substitutes the install root into the unit templates, installs and reloads them, and
with `--enable --nginx` also starts the units and refreshes `deploy/nginx.conf`. Use `--skip-tests`
to iterate on a broken test.

Host layout it produces:

| What            | Where                                                            |
| --------------- | ---------------------------------------------------------------- |
| code            | `/opt/milovermeulen/services/transit` (read-only to the service) |
| archive         | `/var/lib/transit-archive`                                       |
| served snapshot | `/var/www/transit-api/snapshot.json`                             |
| units           | `/etc/systemd/system/transit-{poller,api}.service`               |
| route           | `https://<host>/transit/` → `127.0.0.1:8083`                     |

Both units run as `transit` and call `python3.12 -m services.transit.<module>` with
`WorkingDirectory=/opt/milovermeulen`, so the `services` package has to be installed there. Never
point `WorkingDirectory` at the repo checkout: home directories are `0750` and a service user cannot
traverse them.

**Port.** The `transit-api` unit sets `TRANSIT_API_PORT=8083` because 8082 is already published on
this host by the Riven container. The code default stays 8082 so the service remains portable;
`deploy/nginx.conf` proxies `/transit/` to whichever port the unit declares.

The install also brings `transit-graph.service` + `transit-graph.timer`, a weekly rebuild of the
track graph (Mondays 04:30, `Persistent=true`). The graph build is a oneshot with no `[Install]`, so
the installer enables the timer and leaves the unit alone.

## Tests

```bash
python3.12 -m pytest services/transit/tests -q
ruff check services
```

Fixtures in `tests/fixtures/` are real captured feeds, which is what pins the wire format and the
NYCT extension numbers. `truncated.pb` is a deliberately cut payload used to prove quarantine works.
