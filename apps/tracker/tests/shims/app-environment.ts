// Test-only stand-in for SvelteKit's `$app/environment` (see tsconfig `paths`
// below and tests/bun-plugin-raw.ts). Pretends to be a browser so
// browser-gated entry points exercise their real paths with stubbed globals.
// Caveat: importing a module that starts timers/fetches at top level (e.g.
// state.svelte.ts) would leak them into the test process — no test does that.
export const browser = true;
