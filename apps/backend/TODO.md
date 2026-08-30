# Satellite Tracker - Production TODO

## Done

- [x] Backend: TLE fetcher with Space-Track (incremental updates) + CelesTrak fallback
- [x] Backend: API server with key auth, localhost-only behind nginx
- [x] Backend: nginx reverse proxy with rate limiting, CORS, server header hiding
- [x] Backend: systemd services (api server + 6h fetch timer)
- [x] Backend: 11 tests (parse, merge, load, save)
- [x] Frontend: tracker app fetches from local API first, falls back to CelesTrak/samples
- [x] Frontend: API key via Vite env vars (not hardcoded)
- [x] Security: key rotated, .env gitignored, no secrets in tracked files
- [x] Build: production build script with correct API URL

## Deploy

- [ ] Enable Tailscale Funnel in admin console:
      https://login.tailscale.com/f/funnel?node=ni2tNg8moa11CNTRL
- [ ] Run `tailscale funnel --bg 8080` once enabled
- [ ] Run `./scripts/build-tracker-prod.sh` to build with production API URL
- [ ] Upload `apps/tracker/build/` via SFTP to production server
- [ ] Verify: open deployed site, confirm "Data source: Local API" in control panel

## Harden (optional, for later)

- [ ] Add production domain to nginx CORS map when you have one
- [ ] Consider moving API key server-side if the project grows (backend proxy)
- [ ] Add monitoring/alerting for the fetch timer (notify if fetch fails 3x)
- [ ] Rotate Space-Track password periodically (currently in
      `~/.config/satellite-api/spacetrack-creds`)
