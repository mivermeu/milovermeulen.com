# Satellite Tracker

A real-time 3D satellite globe tracker built with SvelteKit, three.js, and satellite.js. Renders
~16,000 active satellites on an interactive globe with live positions, orbits, and hover/click info
panels.

**Live at:** [/tracker](https://milovermeulen.com/tracker)

## Features

- **3D globe** with landmass coastlines (Natural Earth 110m data)
- **Live satellite positions** propagated via SGP4 in a Web Worker
- **Day/night terminator** on the globe (hand-rolled low-precision solar ephemeris) with subtle
  night-hemisphere dimming
- **Sunlit vs. eclipsed** satellite dots — live per-tick classification against the cylindrical
  Earth shadow, eclipsed dots dimmed
- **Hover** to see satellite name + orbit highlight
- **Click** to pin — detailed orbital info panel (eccentricity, inclination, RAAN, altitude, etc.),
  a subtly-dimmed **ground track** (nadir subpoints one orbital period into the future, always ECF)
  behind the orbit highlight
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

| Variable                 | Required | Description                                                        |
| ------------------------ | -------- | ------------------------------------------------------------------ |
| `VITE_SATELLITE_API_URL` | No       | URL of the local TLE API server. Falls back to CelesTrak if unset. |
| `VITE_SATELLITE_API_KEY` | No       | API key for the local server. Falls back to CelesTrak if unset.    |

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

The production build reads the API key from `.env` and embeds it in the client bundle. This is
acceptable for a personal project; for sensitive data, use a backend proxy.

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

- **All positions computed in ECI** (inertial). ECF display achieved by rotating earth/graticule by
  `-gmst` while dots and orbits stay in ECI.
- **Sun model is hand-rolled** (`src/lib/sun.ts`) — USNO low-precision solar ephemeris + standard
  GMST polynomial, pure and unit-tested against equinox/solstice subsolar points and known eclipse
  geometry. The worker recomputes it per propagate tick for the cylindrical-shadow classification
  and ships a color buffer only when some satellite crosses an eclipse boundary.
- **Night dimming** is a slightly oversized sphere with a small custom `ShaderMaterial` whose alpha
  follows each fragment's normal·sunECF; the ECI sun vector is recomputed on a 60 s wall cadence and
  rotated to ECF with the frame's GMST. `renderOrder = -1` keeps it under dots/orbit lines.
- **Orbit ellipses** sampled over one full period in ECI (closed loops), rotated by delta GMST for
  ECF display.
- **Ground track** is always ECF (each sample rotated by its own GMST, one period into the future at
  128 samples, matching the future-only orbit-line window) and is never affected by the
  reference-frame toggle; rebuilt on the same 5 s cadence as orbits, only while a satellite is
  pinned ("Ground track" toggle in the controls).
- **Single draw call** for all satellite dots (radial gradient texture, vertex colors).
- **Zoom-adaptive point size** — dots scale relative to the globe as you zoom in.
- **Hover highlight** extracts one satellite's orbit from the shared buffer; pin persists it.

## Tech Stack

| Layer             | Technology                      |
| ----------------- | ------------------------------- |
| Framework         | SvelteKit + Svelte 5 (runes)    |
| 3D Rendering      | three.js                        |
| Orbital Mechanics | satellite.js (SGP4/SDP4)        |
| Styling           | Tailwind CSS v4                 |
| Build             | Vite + Turborepo                |
| Compute Offload   | Web Worker (SGP4 propagation)   |
| Data              | Natural Earth 110m (coastlines) |
