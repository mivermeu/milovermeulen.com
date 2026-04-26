```# Agent Guidelines for milovermeulen.com

This document provides guidelines and best practices for AI agents and developers contributing to this project.

## Project Overview
This is a personal portfolio website built with **SvelteKit**, **Svelte 5**, and **Tailwind CSS**. The project emphasizes a high-end, polished aesthetic with custom components like `BracketedSection` and `Noise`.

## Tech Stack
- **Framework**: SvelteKit (latest)
- **UI Library**: Svelte 5 (Runes mode)
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Deployment**: Static Adapter

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
- Maintain a consistent color palette (e.g., `#222` for backgrounds).
- Use `relative` and `absolute` positioning carefully, especially when layering `Noise` or `BracketedSection` components.
- Ensure responsiveness using Tailwind's breakpoint prefixes (`sm:`, `md:`, `lg:`, `xl:`).

## Architecture & Directory Structure

- `src/routes/`: Page definitions and layouts.
- `src/lib/components/`: Reusable UI components.
- `src/lib/assets/`: Static assets like images and SVGs.
- `src/app.css`: Global styles and Tailwind directives.

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
