import type { BunPlugin, OnResolveArgs } from 'bun';

import { dirname, join, normalize } from 'node:path';

// Tests only. Bun cannot resolve Vite's `?raw` query imports (the query fails
// module resolution, before any loader hook runs), and does not apply tsconfig
// path aliases to plugins' own resolutions — so this preload handles both:
// it maps `$lib/...x?raw` to the real file and loads it as text, letting
// `bun test` run the same modules Vite does. Build/runtime are unaffected —
// Vite handles `?raw` natively.
const LIB_ALIAS = '$lib/';

const libRoot = join(dirname(import.meta.dir), 'src', 'lib');

function resolveRaw(args: OnResolveArgs): string {
    let path = args.path.replace(/\?raw$/, '');
    if (path.startsWith(LIB_ALIAS)) path = join(libRoot, path.slice(LIB_ALIAS.length));
    return normalize(path);
}

const rawPlugin: BunPlugin = {
    name: 'vite ?raw loader',
    setup(build) {
        build.onResolve({ filter: /\?raw$/ }, (args) => ({ path: resolveRaw(args) }));
        build.onLoad({ filter: /\.txt$/ }, async (args) => {
            const text = await Bun.file(args.path).text();
            return { contents: `export default ${JSON.stringify(text)};`, loader: 'js' };
        });
        // Svelte 5 runes (`$state(...)` etc.) are compile-time macros Vite
        // strips; under `bun test` they would throw ReferenceError. For
        // module-level state tested here reactivity is irrelevant, so call
        // through: `$state(x)` → `(x)`. Test-only; production builds compile
        // runes properly via vite-plugin-svelte.
        build.onLoad({ filter: /\.svelte\.ts$/ }, async (args) => {
            let text = await Bun.file(args.path).text();
            text = text
                .replace(/\$(state|derived|effect|props)(?:\.[a-z]+)?\(/g, '(')
                .replace(/\$derived\.by\(/g, '(');
            return { contents: text, loader: 'ts' };
        });
    }
};

// Preload scripts register plugins by calling Bun.plugin — a default export is
// never surfaced by the runtime.
Bun.plugin(rawPlugin);
