# Satellite Tracker

A real-time 3D satellite globe tracker built with SvelteKit, three.js, and satellite.js. Renders ~16,000 active satellites on an interactive globe with live positions, orbits, and hover/click info panels.

**Live at:** [/tracker](https://milovermeulen.com/tracker)

## Features

- **3D globe** with landmass coastlines (Natural Earth 110m data)
- **Live satellite positions** propagated via SGP4 in a Web Worker
- **Hover** to see satellite name + orbit highlight
- **Click** to pin — detailed orbital info panel (eccentricity, inclination, RAAN, altitude, etc.)
- **Time controls** — pause, speed up to 60×, scrub ±30 days
- **ECF/ECI reference frame** toggle
- **Data sources** — local API → CelesTrak (live) → bundled sample catalog

## Setup

### Prerequisites

- [bun](https://bun.sh/) (package manager)
- Node.js ≥ 20

### Install

```bash
bun install
```

### Environment Variables

Create `apps/tracker/.env`:

```
VITE_SATELLITE_API_URL=http://localhost:8081/tles.json
VITE_SATELLITE_API_KEY=your-api-key
```

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SATELLITE_API_URL` | No | URL of the local TLE API server. Falls back to CelesTrak if unset. |
| `VITE_SATELLITE_API_KEY` | No | API key for the local server. Falls back to CelesTrak if unset. |

Without these, the app fetches TLE data directly from CelesTrak (public, no auth needed).

See the [backend README](../backend/README.md) for setting up the local API server.

### Development

```bash
bun run dev
# → http://localhost:5176/tracker
```

### Build

```bash
bun run build           # local dev build
bun run build:prod      # production build (bakes in API URL + key from .env)
```

The production build reads the API key from `.env` and embeds it in the client bundle. This is acceptable for a personal project; for sensitive data, use a backend proxy.

### Other Commands

```bash
bun run check           # typecheck (svelte-kit sync + svelte-check)
bun run lint            # ESLint
bun run test            # unit tests
```

## Architecture

```
src/
├── lib/
│   ├── scene/GlobeScene.ts      # three.js scene — globe, satellites, orbits, hover/pin
│   ├── workers/sgp4.worker.ts   # Web Worker — SGP4 propagation, orbit computation
│   ├── satellites/              # TLE fetching, parsing, types
│   ├── components/              # Svelte UI components
│   │   ├── SatelliteViewer.svelte   # Canvas + scene lifecycle
│   │   ├── ControlPanel.svelte      # Speed, orbits, reference frame, time scrub
│   │   └── SatelliteInfo.svelte     # Hover label + pinned info window
│   ├── state.svelte.ts          # Reactive state (satellites, hover, pin, sim time)
│   └── utils.ts                 # Helpers
├── routes/
│   └── +page.svelte             # Main page layout
└── static/
    └── land-110m.json           # Natural Earth coastlines (bundled)
```

### Key Design Decisions

- **All positions computed in ECI** (inertial). ECF display achieved by rotating earth/graticule by `-gmst` while dots and orbits stay in ECI.
- **Single draw call** for all satellite dots (radial gradient texture, vertex colors).
- **Zoom-adaptive point size** — dots scale relative to the globe as you zoom in.
- **Orbit ellipses** sampled over one full period in ECI (closed loops), rotated by delta GMST for ECF display.
- **Hover highlight** extracts one satellite's orbit from the shared buffer; pin persists it.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | SvelteKit + Svelte 5 (runes) |
| 3D Rendering | three.js |
| Orbital Mechanics | satellite.js (SGP4/SDP4) |
| Styling | Tailwind CSS v4 |
| Build | Vite + Turborepo |
| Compute Offload | Web Worker (SGP4 propagation) |
| Data | Natural Earth 110m (coastlines) |
