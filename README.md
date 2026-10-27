# milovermeulen.com

Personal portfolio and project hub, built with **SvelteKit**, **Svelte 5**, and **Tailwind CSS** in
a **Turborepo** monorepo managed by **bun**.

## Apps

| Path          | App                             | Description                                       |
| ------------- | ------------------------------- | ------------------------------------------------- |
| `/`           | [portfolio](./apps/portfolio)   | Personal portfolio and resume                     |
| `/webneut`    | [webneut](./apps/webneut)       | Neutrino oscillation visualizer                   |
| `/tracker`    | [tracker](./apps/tracker)       | Satellite globe tracker (SGP4, three.js, ECF/ECI) |
| `/cool-tools` | [cool-tools](./apps/cool-tools) | Small in-browser utilities                        |
| `/builder`    | builder                         | Cat tree builder (planned)                        |

## Getting Started

```bash
bun install
bun dev      # starts all apps via Turborepo
bun build    # production builds for all apps
bun lint     # lint all apps
```

Each dev server runs on its own port. See individual app `package.json` for ports.

> **webneut requires Rust.** Its `dev`/`build`/`check` scripts compile `apps/webneut/oscillator-rs`
> to WASM automatically. Install the `wasm32-unknown-unknown` target and `wasm-pack` first:
>
> ```bash
> rustup target add wasm32-unknown-unknown
> cargo install wasm-pack
> ```

## Structure

```
├── apps/
│   ├── portfolio/       # SvelteKit + static adapter, base path /
│   ├── webneut/         # SvelteKit + static adapter, base path /webneut
│   │   └── oscillator-rs/  # Rust/WASM neutrino oscillation engine
│   ├── tracker/         # SvelteKit + static adapter, base path /tracker
│   ├── transit/         # SvelteKit + static adapter, base path /transit
│   ├── cool-tools/      # SvelteKit + static adapter, base path /cool-tools
│   └── builder/         # planned
├── services/            # long-running backends: not bun workspaces, deployed by hand
│   └── tracker/         # Python: TLE fetcher + API server
├── packages/
│   └── shared-config/   # shared Tailwind v4 theme, fonts, utility classes
├── deploy/
│   └── nginx.conf       # host vhost fronting every service
├── turbo.json           # Turborepo pipeline config
└── package.json         # root workspace config
```

## Tech Stack

- **Framework**: SvelteKit with `@sveltejs/adapter-static` (fully static site)
- **UI**: Svelte 5 (runes mode)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **Language**: TypeScript
- **Package manager**: bun
- **Build orchestrator**: Turborepo
- **Compute offload**: Rust → WASM (`nalgebra`, via `wasm-pack`) for the webneut neutrino
  oscillation engine
- **3D rendering**: three.js (WebGL2) lines-only globe in tracker, SGP4 orbit propagation in a Web
  Worker

## Deployment

Pushing to `main` runs [`.github/workflows/deploy-site.yml`](./.github/workflows/deploy-site.yml),
which tests, builds, and uploads the static apps over FTPS. Deployable apps are discovered
dynamically — every `apps/*/svelte.config.js` — so there is no list to maintain. On push, only the
apps whose files changed are deployed; a change to shared files (`packages/**`, `package.json`,
`bun.lock`, `turbo.json`) deploys all of them.

Configure it under **Settings → Secrets and variables → Actions**:

| Kind            | Name                                                                   |
| --------------- | ---------------------------------------------------------------------- |
| Secret          | `FTPS_HOST`, `FTPS_USER`, `FTPS_PASSWORD`                              |
| Variable        | `FTPS_REMOTE_DIR` (document root on the host, e.g. `/public_html`)     |
| Variable (opt.) | `FTPS_PORT`, `FTPS_MODE`, `FTPS_VERIFY_CERT`, `VITE_SATELLITE_API_URL` |

The deploy job targets a GitHub Environment named `production`; add protection rules there to
require approval before shipping. Uploads never delete, so content-hashed assets accumulate on the
host.
