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
- **Info panel extras** — NORAD catalog ID, TLE epoch age (days), and current speed in km/s (ECI)
- **Search by name or NORAD ID** — all-digit queries match catalog IDs (alpha-5 aware), other
  queries match labels
- **Orbital element graph** — any pair of elements/derived values as a scatter plot with live hover
  coordinates
- **Global simulated clock** — one shared simulated time fans out to every view: pause/play, speed
  stepper (1× / 10× / 60× / 600×), a **symmetric-log ±30-day scrub slider** (~0.2 s resolution at
  the center for LEO-scale nudges; ±30 days still one sweep away), a simulated-UTC readout, and a
  **NOW** reset that re-engages exact real time ("now" is a clock _mode_ pinned to the wall clock,
  so the stay-live state never flickers between now/±0 s)
- **ECF/ECI reference frame** toggle
- **Pass finder** — set an observer location (geolocation or manual) and see the next 20 passes over
  your horizon (10°) in the next 2 days, with live countdowns and az/el; rows pin the satellite on
  the globe
- **Orbital element explorer** — scatter the catalog over any pair of graph parameters
- **Favorites** — star a satellite from its info panel; the watch list persists in localStorage
- **Shareable deep links** — view state is mirrored to the URL (see below)
- **Data sources** — local API → CelesTrak (live) → bundled sample catalog

### Share links

The tracker mirrors its key state into the query string (debounced, via `history.replaceState` —
never a new history entry). Links stay clean: params equal to the defaults are omitted.

| Param   | Values                                    | Meaning                                            |
| ------- | ----------------------------------------- | -------------------------------------------------- |
| `sat`   | NORAD catalog number                      | Pin (and reveal in the filter tree) that satellite |
| `mode`  | `epoch` \| `smoothed` \| `instantaneous`  | Which orbital-element set the graph plots          |
| `frame` | `ecf` \| `eci`                            | Reference frame                                    |
| `gx`    | graph parameter key (e.g. `e`, `perigee`) | X axis of the orbital graph                        |
| `gy`    | graph parameter key                       | Y axis of the orbital graph                        |

Example: `https://milovermeulen.com/tracker?sat=25544&frame=eci&gx=e&gy=period`

Invalid values are ignored silently. URL params are applied on load (after the catalog and filter
tree initialise) and win over localStorage; favorites are an independent convenience layer. The
shared simulated clock deliberately stays out of the URL: scrub/pause state is a session, not a
destination.

> **Note on simulated time:** SGP4 propagates from each satellite's published TLE elements, so
> accuracy degrades as simulated time moves away from the TLE epochs — positions stay plausible, but
> expect growing drift past ~2 days. The UI flags that band ("simulated · accuracy degrading"); the
> ±30-day scrub window exists because simulation is approximate, not a prediction.

The default state is exact real time (0 offset, playing, 1×) — the app behaves as a real-time
tracker until a time control is touched. Real time is a first-class clock mode rather than an offset
comparison: while live, the central tick pins the epoch to the wall clock and no count of scrubbing,
pausing (a pause/play round-trip within half a second re-joins the live feed), or speed changing
leaves half-measures. A snapshot whose simulated epoch jumps backwards or discontinuously (scrub
jump, reverse) is snapped into place rather than blended so the globe and orbital-parameter graph
cannot diverge; blend is reserved for routine simulated-time advances.

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
│   ├── workers/sgp4.worker.ts   # Web Worker — SGP4 propagation, orbit computation, pass search
│   ├── satellites/              # TLE fetching, parsing, types
│   ├── passes.ts                # pass finding (plane screen, coarse stepping, bisection refine)
│   ├── observer.svelte.ts       # observer location state (geolocation, manual entry, localStorage)
│   ├── graph-params.ts          # Plotable graph parameter metadata (shared with URL encoding)
│   ├── url-state.ts             # URL param parse/encode + NORAD helpers (pure)
│   ├── url-sync.svelte.ts       # Reactive URL deep-link + favorites glue ($effect.root)
│   ├── favorites.ts             # Favorites store helpers (pure, storage-injected)
│   ├── components/              # Svelte UI components
│   │   ├── SatelliteViewer.svelte   # Canvas + scene lifecycle
│   │   ├── ControlPanel.svelte      # Speed, orbits, reference frame, time scrub, favorites
│   │   ├── FilterPanel.svelte       # Filter tree + search
│   │   ├── PassesPanel.svelte       # Observer location + pass countdown list
│   │   └── SatelliteInfo.svelte     # Hover label + pinned info window (star button)
│   ├── state.svelte.ts          # Reactive state (satellites, hover, pin, sim time, favorites)
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
  follows each fragment's normal·sunECF; the ECI sun vector follows the shared simulated clock
  (recomputed on a 60 s simulated cadence and rotated to ECF with the clock's GMST), so a scrub
  carries the day/night lighting with it. `renderOrder = -1` keeps it under dots/orbit lines.
- **One shared simulated clock** (`trackerState.simEpochMs`, stepped in `state.svelte.ts`; the pure
  stepping/continuity math lives in `lib/simclock.ts`). Propagation requests are stamped with the
  simulated epoch plus a future-of-cadence lead in simulated time, and all views blend against the
  same simulated epoch — so globe, graph, and info panel are always in lockstep.
- **Continuity guard** (`epochAction` in `lib/simclock.ts`): snapshots whose simulated epoch is
  future-of-cadence blend; backwards epochs on an unchanged revision are dropped (a watchdog refire
  overtaking a slow original, on a FIFO worker); discontinuous epochs (scrub jumps/reverses — always
  revision-bumped) snap; equal epochs (paused clock) drop.
- **Frame-rate rendering epoch** (`renderEpochMs()` in `state.svelte.ts`): the clock ticks every 50
  ms for state/propagation, but renderers interpolate the epoch at RAF rate — at 600× a tick is ~30
  s of simulated motion, enough to visibly step the dots.
- **Dead reckoning** (`renderBlend`): past the newest snapshot the blend keeps gliding along the
  pair's own velocity (capped at half an interval), so worker-arrival jitter at high speeds holds no
  stuttering pauses.
- **Tracks slide between rebuilds** (`lib/trackSlide.ts`): the worker bakes each satellite's orbit
  as a vertex **chain** of two ν-continuous periods with per-vertex time offsets and the satellite's
  period (plus an SGP4-failure run list). Every drawn satellite owns a **fixed edge-slot range** in
  one shared LineSegments buffer; per frame its window — one period of chain vertices starting at
  the satellite's live dot position and ending at an interpolated vertex exactly one period ahead —
  is written into its slot as explicit duplicated-endpoint edges, with degenerate point pairs
  padding the unused tail (they render as nothing). No draw ranges, no per-frame reallocation, no
  adjacency assumptions anywhere. Identical treatment for pinned, hovered, and unpinned orbits up to
  the slide cap (1500 satellites); fragmented chains (honest SGP4-failure gaps) and oversized
  catalogs draw the bake's first run statically into the same slots. The ECF space track is open by
  construction (the earth rotates ~22° under a LEO period, so a one-period arc's endpoints don't
  coincide in ECF) — windows never wrap or close on themselves.
- **Ground track** slides the same way on its own two-period time-uniform bake (128 uniform steps
  per period; the visible window starts at the satellite's live subpoint).
- **Single draw call** for all satellite dots (radial gradient texture, vertex colors).
- **Zoom-adaptive point size** — dots scale relative to the globe as you zoom in.
- **Orbit ellipses** sampled over two full ν-continuous periods in ECI, rotated by delta GMST for
  ECF display; only one period is drawn per orbit, slid to the live dot position.
- **Ground track** is always ECF (each sample rotated by its own GMST, drawn one period into the
  future from a two-period time-uniform bake) and is never affected by the reference-frame toggle;
  rebuilt on the same 5 s cadence as orbits, only while a satellite is pinned ("Ground track" toggle
  in the controls).
- **Hover highlight** paints the focus satellite's slid window into its own fixed slot; pin persists
  it.
- **Graph axis keys live in `trackerState`** (not component-local state) so URL deep links can seed
  and mirror them; the graph parameter metadata is shared with the URL encoder in `graph-params.ts`.
- **URL writes use `history.replaceState`**, debounced and skipped when nothing changed; the
  reactive glue deliberately `untrack`s deep reads of the `satellites` proxy (a tracked deep read
  re-fires effects on catalog mutations).
- **Favorites never touch the filter tree's rows** — pinning from a favorite (or a `sat` deep link)
  goes _through_ the tree (select + reveal the existing leaf), so leaf ids stay unique.
- **Passes** are searched in the shared SGP4 worker over the tree-filtered catalog: a static
  orbit-plane screen discards never-visible satellites, coarse stepping is sized per satellite from
  its own max above-threshold duration, and candidate passes refine by bisection with satellite.js
  look angles. The chronological (min-heap) scan stops once the top-20-by-start list cannot be
  beaten; results reach the UI with a catalog generation stamp to drop stale snapshots. A
  `PassVisibilityGate` hook (`passes.ts` + the worker's `passVisibilityGate` constant) awaits
  sunlit/observer-darkness filtering from the sun model feature.

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
