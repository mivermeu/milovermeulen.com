# milovermeulen.com

Personal portfolio and project hub, built with **SvelteKit**, **Svelte 5**, and **Tailwind CSS** in a **Turborepo** monorepo managed by **bun**.

## Apps

| Path | App | Description |
|------|-----|-------------|
| `/` | [portfolio](./apps/portfolio) | Personal portfolio and resume |
| `/webneut` | [webneut](./apps/webneut) | Neutrino oscillation visualizer |
| `/tracker` | tracker | Satellite tracker (planned) |
| `/builder` | builder | Cat tree builder (planned) |

## Getting Started

```bash
bun install
bun dev      # starts all apps via Turborepo
bun build    # production builds for all apps
bun lint     # lint all apps
```

Each dev server runs on its own port. See individual app `package.json` for ports.

> **webneut requires Rust.** Its `dev`/`build`/`check` scripts compile `apps/webneut/oscillator-rs` to WASM automatically. Install the `wasm32-unknown-unknown` target and `wasm-pack` first:
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
│   ├── tracker/         # planned
│   └── builder/         # planned
├── packages/
│   └── shared-config/   # shared Tailwind v4 theme, fonts, utility classes
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
- **Compute offload**: Rust → WASM (`nalgebra`, via `wasm-pack`) for the webneut neutrino oscillation engine