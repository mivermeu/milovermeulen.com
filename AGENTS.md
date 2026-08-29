```# Agent Guidelines for milovermeulen.com

This document provides guidelines and best practices for AI agents and developers contributing to this project.

## Project Overview
This is a **Turborepo monorepo** managed by **bun** containing multiple apps under a single domain:
- `apps/portfolio` (`/`) — Personal portfolio and resume website
- `apps/webneut` (`/webneut`) — Neutrino oscillation visualizer
- `apps/tracker` (`/tracker`) — Satellite globe tracker
- `apps/builder` (`/builder`) — Cat tree builder (planned)

All apps are built with **SvelteKit**, **Svelte 5**, and **Tailwind CSS v4**. The portfolio app emphasizes a high-end, polished aesthetic with custom components like `BracketedSection` and `Noise`.

## Workspace Structure

```

apps/ # independent SvelteKit apps portfolio/ # base path / webneut/ # base path /webneut
oscillator-rs/ # Rust/WASM oscillation engine packages/ shared-config/ # shared Tailwind theme,
fonts, and utility CSS

````

- Shared Tailwind tokens live in `packages/shared-config/app.css`. Import via `@import 'shared-config/app.css';`.
- Each app has its own `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, and `src/`.
- Each app uses `@sveltejs/adapter-static` with `prerender = true` and sets `kit.paths.base` for its subroute.

## Commands

```bash
bun install          # install all workspace dependencies
bun dev              # start all dev servers via Turborepo
bun build            # production builds for all apps
bun lint             # lint all apps
bun format           # run Prettier across the repo
bun test             # run all tests via Turborepo (bun test per app)
bun run test         # same as above; both invoke `turbo test`
bun run build:wasm   # (webneut) compile the Rust crate to WASM
````

### Before finalizing a task

Run `bun test` (repo-wide, via Turborepo) so every app's suite passes. Do **not** run bare
`bun test` from the repo root: it collects all workspaces' tests but runs them with the root as cwd,
which breaks webneut's WASM test (it reads `src/lib/wasm/pkg` relative to the app). Use
`bun run test` / `bun test`, or `cd apps/<app> && bun test` per app.

The webneut app's `dev`, `build`, and `check` scripts run `build:wasm` automatically, so no manual
step is needed in normal workflows. Building webneut requires the Rust toolchain: the
`wasm32-unknown-unknown` target and `wasm-pack`
(`rustup target add wasm32-unknown-unknown && cargo install wasm-pack`).

## Tech Stack

- **Framework**: SvelteKit
- **UI Library**: Svelte 5 (Runes mode enforced via `svelte.config.js`)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript
- **Deployment**: Static Adapter (`@sveltejs/adapter-static`)
- **Package Manager**: bun
- **Build Orchestrator**: Turborepo
- **Compute Offload**: Rust → WASM (webneut, via `wasm-pack`)
- **Math**: `nalgebra` (Rust crate, 3×3 complex matrix operations for neutrino oscillation)

## Adding a New App

1. Copy the webneut scaffold as a starting point: `cp -r apps/webneut apps/new-app`
2. Update `apps/new-app/package.json` name and port
3. Set `kit.paths.base` in `apps/new-app/svelte.config.js` to `/new-app`
4. Add `shared-config: "workspace:*"` to its devDependencies
5. Run `bun install`

## Svelte 5 Best Practices

### 1. Use Runes for Reactivity

Avoid the old `let` and `$: ` syntax. Use Svelte 5 runes:

- `$state()`: For declaring reactive state.
- `$derived()`: For state that depends on other state.
- `$effect()`: For side effects (use sparingly).
- `$props()`: For declaring component properties.

### 2. Component Communication

- **Props**: Use `$props()` for all inputs. Destructure them for clarity.
- **Events**: Do not use `createEventDispatcher`. Instead, pass callback functions as props (e.g.,
  `onclick={...}`).
- **Snippets**: Use `{#snippet ...}` and `{@render ...}` instead of `<slot />` for flexible content
  projection.

### 3. Performance & Optimization

- Use `transform-gpu` for animations and noise overlays to ensure hardware acceleration.
- Keep components small and focused.
- Leverage Svelte's built-in transitions and animations for a premium feel.

## Styling Guidelines

### Tailwind CSS

- Use utility classes exclusively.
- Import shared theme via `@import 'shared-config/app.css';` in each app's `src/app.css`.
- Maintain the brand color palette defined in the shared config.
- Use `relative` and `absolute` positioning carefully, especially when layering `Noise` or
  `BracketedSection` components.
- Ensure responsiveness using Tailwind's breakpoint prefixes (`sm:`, `md:`, `lg:`, `xl:`).

## Portfolio App Architecture

- `src/routes/`: Page definitions and layouts.
- `src/lib/components/`: Reusable UI components.
- `src/lib/sections/`: Page section components (About, Experience, Projects, Aside).
- `src/lib/data/`: Static data (experience, education, projects, socials, icons).
- `src/lib/state/`: Shared reactive state.
- `src/lib/audio/`: Web Audio API sound effects.
- `src/app.css`: App-specific CSS overrides (imports shared-config).

## Webneut App Architecture

- `oscillator-rs/`: Rust crate (`nalgebra`) compiled to WASM via `wasm-pack`. Exposes a single
  JSON-in/JSON-out `oscillate(json) -> json` function. Run its native tests with `cargo test --lib`
  (in the crate dir).
- `src/lib/wasm/`: JS bridge (`oscillator.ts`) that eager-inits the WASM module on page load and
  exposes a synchronous `oscillate(params)`; `pkg/` is generated output (gitignored).
- `src/lib/webneut/`: `state.svelte.ts` (reactive state + `recompute()` that calls the WASM bridge),
  components, `types.ts`, and data.
- `src/lib/wasm/oscillator.test.ts`: bun test coverage (`bun test`).

The `oscillate` computation is fully offloaded to WASM — there is no JS fallback path. Numerical
parity between WASM and the original mathjs implementation was verified before removing it; physics
correctness is asserted by `cargo test --lib` and the WASM smoke test (probabilities sum to 1).

## Tracker App Architecture

- `src/lib/scene/GlobeScene.ts`: three.js scene — opaque earth sphere, graticule, equator ring,
  satellite dots (round, zoom-adaptive), orbit lines, hover highlight. Manages the render loop and
  worker communication.
- `src/lib/workers/sgp4.worker.ts`: Web Worker — SGP4 propagation via `satellite.js`. Handles
  `propagate` (satellite positions) and `buildOrbits` (orbit paths) messages. All positions computed
  in ECI.
- `src/lib/satellites/tle.ts`: TLE fetching (CelesTrak live with bundled sample fallback) and
  parsing.
- `src/lib/state.svelte.ts`: Reactive state — speed, reference frame (ECF/ECI), simulation time,
  satellite data.
- `src/lib/components/ControlPanel.svelte`: UI — speed controls, reference frame toggle, time scrub
  slider (±30 days), orbit toggle, stats.
- `src/lib/satellites/data/sample-tles.txt`: Bundled sample catalog (~90 satellites including
  Molniya and polar orbits).

Key design decisions:

- All positions computed in ECI (inertial). ECF display achieved by rotating the
  earth/graticule/equator by `-gmst` while dots and orbits stay in ECI.
- Orbit ellipses sampled over one full period in ECI (closed loops). The orbit mesh rotates by
  `-gmst` each frame to align with the ECF scene.
- Satellite dots use a circular radial-gradient texture (single draw call, scales to any catalog
  size).
- Hover highlight rebuilds the orbit geometry excluding the hovered satellite's range (one-shot copy
  on pointermove, not per-frame).

## Component Guidelines

- **Consistency**: New components should follow the design language of existing ones (e.g., using
  the `BracketedSection` wrapper where appropriate).
- **TypeScript**: All components must be strictly typed. Define interfaces for `Props`.
- **Accessibility**: Ensure all interactive elements are keyboard accessible and have appropriate
  ARIA labels.

## Development Workflow

1. **Analyze**: Read existing components to understand the design patterns.
2. **Implement**: Create the logic using Svelte 5 runes.
3. **Style**: Apply Tailwind classes to match the visual identity.
4. **Verify**: Ensure the layout remains stable across different screen sizes.

## Git & GitHub Policy

**Never commit, push, open PRs, or perform any GitHub actions unless the user explicitly requests
it.** Always wait for confirmation before staging, committing, or pushing changes.

Before committing, run `bun format` to ensure all code is formatted with Prettier.

```

```
