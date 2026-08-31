# Satellite Tracker Backend

TLE data fetcher and API server for the [Satellite Tracker](../tracker/) app. Fetches orbital data
from Space-Track (with CelesTrak fallback), persists it to disk, and serves it over HTTP with API
key authentication.

Zero external Python dependencies — stdlib only.

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

| Component   | Purpose                                                   | Runs                            |
| ----------- | --------------------------------------------------------- | ------------------------------- |
| `fetch.py`  | Fetches TLE data, merges with existing, writes atomically | Cron / systemd timer (every 6h) |
| `server.py` | Serves `tles.json` with API key auth                      | systemd service (always-on)     |

## Quick Start (Local Development)

### 1. Create directories

```bash
mkdir -p ~/.config/satellite-api
mkdir -p /var/www/satellite-api
```

### 2. Set up Space-Track credentials (optional, for full catalog)

Create `~/.config/satellite-api/spacetrack-creds` with two lines:

```
your-username
your-password
```

Get a free account at https://www.space-track.org/

Without this, `fetch.py` falls back to CelesTrak (public, no auth).

### 3. Run the fetcher

```bash
cd apps/backend
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
python3 apps/backend/server.py
# Satellite API listening on 127.0.0.1:8081
```

### 5. Generate an API key

```bash
openssl rand -hex 32 > ~/.config/satellite-api/key
```

### 6. Test it

```bash
curl -H "X-API-Key: $(cat ~/.config/satellite-api/key)" http://localhost:8081/tles.json | head -c 200
```

## Environment Variables

| Variable                 | Default                       | Description                   |
| ------------------------ | ----------------------------- | ----------------------------- |
| `SATELLITE_API_HOST`     | `127.0.0.1`                   | Server bind address           |
| `SATELLITE_API_PORT`     | `8081`                        | Server port                   |
| `SATELLITE_DATA_DIR`     | `/var/www/satellite-api`      | Directory to serve files from |
| `SATELLITE_API_KEY_FILE` | `~/.config/satellite-api/key` | Path to API key file          |

## Frontend Integration

The tracker app looks for these Vite env vars (set in `.env` or via `--env`):

```
VITE_SATELLITE_API_URL=http://localhost:8081/tles.json
VITE_SATELLITE_API_KEY=<your-key>
```

Without these, the frontend falls back to CelesTrak → bundled samples.

## Production Deployment

### nginx

The config is in `nginx.conf`. Copy it to `/etc/nginx/sites-available/satellite-api` and symlink to
`sites-enabled`. Requires a `limit_req_zone` directive in the `http` block of
`/etc/nginx/nginx.conf`:

```nginx
limit_req_zone $binary_remote_addr zone=satellite_api:10m rate=10r/s;
```

CORS is handled by the Python server directly (`server.py`), not nginx.

### systemd

**API server** (`/etc/systemd/system/satellite-api.service`):

```ini
[Unit]
Description=Satellite TLE API Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /path/to/apps/backend/server.py
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
ExecStart=/usr/bin/python3 -c "from apps.backend.fetch import *; ..."
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
python3 -m pytest apps/backend/tests/ -v
```

Or with unittest:

```bash
cd apps/backend
python3 -m unittest discover -s tests -v
```

## Linting & Formatting

```bash
ruff check apps/backend/
ruff format apps/backend/
npx basedpyright apps/backend/
```
