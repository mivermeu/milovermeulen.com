# Agent Guidelines for milovermeulen.com

## Build/Lint/Test Commands

-   **Development server**: `yarn dev` (Vite dev server)
-   **Build**: `yarn build` (Vite build)
-   **E2E tests**: `yarn test` (Playwright)
-   **Unit tests**: `yarn test:unit` (Vitest)
-   **Single test**: `yarn dlx playwright test tests/filename.test.ts` or `yarn dlx vitest run tests/filename.test.ts`
-   **Lint**: `yarn lint` (Prettier + ESLint)
-   **Format**: `yarn format` (Prettier auto-fix)
-   **Type check**: `yarn check` (SvelteKit sync + svelte-check)

## Code Style Guidelines

### Formatting (Prettier)

-   4 spaces indentation (no tabs)
-   Single quotes for strings
-   No trailing commas
-   100 character line width
-   Svelte plugin enabled

### Linting (ESLint)

-   TypeScript recommended rules
-   Svelte recommended rules
-   Prettier integration
-   Strict TypeScript mode enabled

### Naming Conventions

-   **Variables/Functions**: camelCase
-   **Components/Types**: PascalCase
-   **Files**: kebab-case for Svelte files, camelCase for TypeScript
-   **Constants**: UPPER_SNAKE_CASE

### Imports

-   External imports first
-   Internal imports second (use `$lib/` aliases)
-   Group by type, separate with blank lines
-   Type-only imports use `import type` syntax

### Error Handling

-   Use `throw new Error()` for invalid states
-   Validate props in component script blocks
-   Handle async operations with try/catch when needed

### TypeScript

-   Strict mode enabled
-   Use explicit types for component props
-   Prefer interfaces over types for object shapes
-   Use union types for variant props

### Svelte Specific

-   Use TypeScript in script blocks (`<script lang='ts'>`)
-   Export props with explicit types
-   Use slots for flexible component composition
-   Prefer CSS variables for theming
-   Use transitions sparingly and purposefully
