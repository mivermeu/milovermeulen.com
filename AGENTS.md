```# Agent Guidelines for milovermeulen.com

This document provides guidelines and best practices for AI agents and developers contributing to this project.

## Project Overview
This is a **Turborepo monorepo** managed by **bun** containing multiple apps under a single domain:
- `apps/portfolio` (`/`) — Personal portfolio and resume website
- `apps/webneut` (`/webneut`) — Neutrino oscillation visualizer
- `apps/tracker` (`/tracker`) — Satellite tracker (planned)
- `apps/builder` (`/builder`) — Cat tree builder (planned)

All apps are built with **SvelteKit**, **Svelte 5**, and **Tailwind CSS v4**. The portfolio app emphasizes a high-end, polished aesthetic with custom components like `BracketedSection` and `Noise`.

## Workspace Structure

```
apps/                     # independent SvelteKit apps
  portfolio/              # base path /
  webneut/                # base path /webneut
packages/
  shared-config/          # shared Tailwind theme, fonts, and utility CSS
```

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
```

## Tech Stack
- **Framework**: SvelteKit
- **UI Library**: Svelte 5 (Runes mode enforced via `svelte.config.js`)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript
- **Deployment**: Static Adapter (`@sveltejs/adapter-static`)
- **Package Manager**: bun
- **Build Orchestrator**: Turborepo

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
- **Events**: Do not use `createEventDispatcher`. Instead, pass callback functions as props (e.g., `onclick={...}`).
- **Snippets**: Use `{#snippet ...}` and `{@render ...}` instead of `<slot />` for flexible content projection.

### 3. Performance & Optimization
- Use `transform-gpu` for animations and noise overlays to ensure hardware acceleration.
- Keep components small and focused.
- Leverage Svelte's built-in transitions and animations for a premium feel.

## Styling Guidelines

### Tailwind CSS
- Use utility classes exclusively.
- Import shared theme via `@import 'shared-config/app.css';` in each app's `src/app.css`.
- Maintain the brand color palette defined in the shared config.
- Use `relative` and `absolute` positioning carefully, especially when layering `Noise` or `BracketedSection` components.
- Ensure responsiveness using Tailwind's breakpoint prefixes (`sm:`, `md:`, `lg:`, `xl:`).

## Portfolio App Architecture

- `src/routes/`: Page definitions and layouts.
- `src/lib/components/`: Reusable UI components.
- `src/lib/sections/`: Page section components (About, Experience, Projects, Aside).
- `src/lib/data/`: Static data (experience, education, projects, socials, icons).
- `src/lib/state/`: Shared reactive state.
- `src/lib/audio/`: Web Audio API sound effects.
- `src/app.css`: App-specific CSS overrides (imports shared-config).

## Component Guidelines
- **Consistency**: New components should follow the design language of existing ones (e.g., using the `BracketedSection` wrapper where appropriate).
- **TypeScript**: All components must be strictly typed. Define interfaces for `Props`.
- **Accessibility**: Ensure all interactive elements are keyboard accessible and have appropriate ARIA labels.

## Development Workflow
1. **Analyze**: Read existing components to understand the design patterns.
2. **Implement**: Create the logic using Svelte 5 runes.
3. **Style**: Apply Tailwind classes to match the visual identity.
4. **Verify**: Ensure the layout remains stable across different screen sizes.
```