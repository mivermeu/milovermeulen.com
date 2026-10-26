# Tracker service

TLE data fetcher and API server for the [Satellite Tracker](../../apps/tracker/) app. Fetches
orbital data from Space-Track (with CelesTrak fallback), persists it to disk, and serves it over
HTTP.

Zero external Python dependencies — stdlib only. Requires Python 3.12+ (declared in the root
`pyproject.toml`; the backend uses `datetime.UTC`).

## Architecture

```
Space-Track / CelesTrak
        │
        ▼
   fetch.py ──writes──▶ tles.json (on disk)
                            │
                            ▼
                      server.py ──serves──▶ Frontend
                        (behind nginx)
```

Two independent components that share a JSON file on disk:

| Component   | Purpose                                                                                      | Runs                            |
| ----------- | -------------------------------------------------------------------------------------------- | ------------------------------- |
| `fetch.py`  | Fetches TLE data, merges with existing, enriches with SATCAT object types, writes atomically | Cron / systemd timer (every 6h) |
| `server.py` | Serves `tles.json` with API key auth                                                         | systemd service (always-on)     |

## Quick Start (Local Development)

### 1. Create directories

```bash
mkdir -p ~/.config/satellite-api
mkdir -p /var/www/satellite-api
```

### 2. Set up Space-Track credentials (optional, for full catalog)

Create `~/.config/satellite-api/spacetrack-creds` with a single `username:password` line:

```
your-username:your-password
```

Get a free account at https://www.space-track.org/

Without this, `fetch.py` falls back to CelesTrak (public, no auth).

### 3. Run the fetcher

```bash
cd services/tracker
python3 -c "
from fetch import *
from pathlib import Path

tle_path = Path('/var/www/satellite-api/tles.json')
creds_path = Path.home() / '.config/satellite-api/spacetrack-creds'

existing = load_existing(tle_path)

if creds_path.exists():
    user, pwd = creds_path.read_text().strip().split('\n')
    opener, ok = make_spacetrack_opener(user, pwd, 'https://www.space-track.org/ajaxauth/login')
    if ok:
        url = 'https://www.space-track.org/bodyspacespacedata/query/class/gp/EPOCH/>now-1/format/json'
        new = fetch_gp_json(opener, url)
        if new:
            merged = merge_tles(existing, new)
            save_json(list(merged.values()), tle_path)
            print(f'Space-Track: {len(new)} fetched, {len(merged)} total')
        else:
            print('Space-Track fetch failed')
    else:
        print('Space-Track auth failed')

if not tle_path.exists():
    new = fetch_celestrak('https://www.celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle')
    if new:
        save_json(new, tle_path)
        print(f'CelesTrak fallback: {len(new)} satellites')
"
```

### 4. Start the API server

```bash
python3 services/tracker/server.py   # from the repo root
# Satellite API listening on 127.0.0.1:8081
```

### 5. Test it

```bash
curl http://localhost:8081/tles.json | head -c 200
```

## Environment Variables

| Variable                  | Default                  | Description                                     |
| ------------------------- | ------------------------ | ----------------------------------------------- |
| `SATELLITE_API_HOST`      | `127.0.0.1`              | Server bind address                             |
| `SATELLITE_API_PORT`      | `8081`                   | Server port                                     |
| `SATELLITE_DATA_DIR`      | `/var/www/satellite-api` | Directory to serve files from                   |
| `SATELLITE_CACHE_MAX_AGE` | `1800`                   | `Cache-Control` max-age (seconds) for responses |

## Caching & compression

The TLE catalog is several MB. `server.py` sends
`Cache-Control: public, max-age=<SATELLITE_CACHE_MAX_AGE>` with `ETag` / `Last-Modified` validators,
answers conditional requests with `304`, and supports `HEAD` — so repeat loads are cheap.
`deploy/nginx.conf` gzips `application/json` on the way out (~4.5 MB → ~1.2 MB; enable `ngx_brotli`
for a further ~30%). Deploy the updated `deploy/nginx.conf` and reload nginx for the compression to
take effect.

## Object type enrichment

With Space-Track credentials configured, `fetch.py` also pulls the SATCAT class (cached to
`object-types.json`, refreshed at most once per 20h) and attaches a normalized `objectType` to each
TLE record — one of `payload`, `rocket-body`, `debris`, or `unknown`. The field is present only
where a matching NORAD ID is known, so consumers should fall back to name-based heuristics.

## Function category enrichment

`fetch.py` also derives a function `category` from CelesTrak's curated groups (public — no
credentials needed): group membership maps to `navigation`, `weather`, `earth-observation`,
`communications`, `science`, `military`, or `other` and is attached to each record. Every group is
downloaded in one pass — CelesTrak's limit is one download _per group_ per 2h, so a whole-set pull
is fine — and the result is cached to `categories.json`, refreshed at most once per
`CATEGORY_REFRESH_INTERVAL_S` (20h). Groups are visited in priority order, so a specific group
(`weather`) beats a broad one (`geo`), and the cache is merged by priority rank — a group that fails
can't downgrade an object to a lower-priority category. Only objects in a named group get a
category; the rest fall back to the frontend's name heuristic.

## Frontend Integration

The tracker app looks for this Vite env var (set in `.env` or via `--env`):

```
VITE_SATELLITE_API_URL=https://thehuis.tail4fbfb1.ts.net/tles.json
```

Without this, the frontend falls back to CelesTrak → bundled samples.

## Production Deployment

### nginx

The config is in `deploy/nginx.conf` — one vhost shared by every service on the host. Copy it to
`/etc/nginx/sites-available/site` and symlink it into `sites-enabled` (the current install on this
host is still named `satellite-api`; either name works, it is the same single vhost). The file is
self-contained: it declares the `limit_req_zone` it uses, so do not repeat that directive in
`nginx.conf` — nginx rejects a duplicate zone name.

CORS is handled by the Python server directly (`server.py`), not nginx.

After editing the config, validate it and reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Then verify compression, caching, and revalidation are live (send `Accept-Encoding` explicitly —
some servers skip compression on `HEAD`):

```bash
curl -sS -D - -o /dev/null -H 'Accept-Encoding: gzip' \
  https://<api-host>/tles.json \
  | grep -iE 'content-encoding|vary|cache-control|etag'
# expect: content-encoding: gzip, vary: Accept-Encoding,
#         cache-control: public, max-age=1800, etag: "..."

# A conditional request with the returned ETag should answer 304.
ETAG=$(curl -sS -D - -o /dev/null -H 'Accept-Encoding: gzip' https://<api-host>/tles.json \
  | awk -F': ' 'tolower($1)=="etag"{print $2}' | tr -d '\r')
curl -sS -o /dev/null -w '%{http_code}\n' -H "If-None-Match: $ETAG" https://<api-host>/tles.json
# expect: 304
```

### systemd

**API server** (`/etc/systemd/system/satellite-api.service`):

```ini
[Unit]
Description=Satellite TLE API Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3.12 /path/to/services/tracker/server.py
Restart=on-failure
RestartSec=5
Environment=SATELLITE_API_HOST=127.0.0.1
Environment=SATELLITE_API_PORT=8081

[Install]
WantedBy=multi-user.target
```

**Fetch timer** (`/etc/systemd/system/satellite-fetch.service` + `.timer`):

```ini
# satellite-fetch.service
[Unit]
Description=Fetch satellite TLE data

[Service]
Type=oneshot
WorkingDirectory=/path/to/milovermeulen.com
ExecStart=/usr/bin/python3.12 -c "from services.tracker.fetch import *; ..."
```

```ini
# satellite-fetch.timer
[Unit]
Description=Fetch TLE data every 6 hours

[Timer]
OnBootSec=5min
OnUnitActiveSec=6h

[Install]
WantedBy=timers.target
```

### Tailscale Funnel (optional)

To expose the API externally without managing TLS:

```bash
tailscale funnel --bg 8080
```

### Production build

```bash
./scripts/build-tracker-prod.sh
# Outputs apps/tracker/build/ — upload via SFTP
```

## Running Tests

```bash
pip install pytest  # or use your preferred test runner
python3 -m pytest services/tracker/tests/ -v
```

Or with unittest:

```bash
cd services/tracker
python3 -m unittest discover -s tests -v
```

## Linting & Formatting

```bash
ruff check services/tracker/
ruff format services/tracker/
npx basedpyright services/tracker/
```
