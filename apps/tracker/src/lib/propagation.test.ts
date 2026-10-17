import { describe, expect, test } from 'bun:test';

// Regression test: PassesPanel passes `trackerState.activeIndices` (a Svelte
// `$state` proxy) straight into `findPasses`, and `postMessage` structured-
// clones its argument — cloning a Proxy throws DataCloneError, which silently
// killed every UI-issued search at the service boundary (the panel spun
// forever). The service must snapshot plain data before posting.

describe('propagation.findPasses cloning boundary', () => {
    test('proxy-wrapped indices post as a plain cloneable array', async () => {
        const posted: unknown[] = [];
        const g = globalThis as unknown as Record<string, unknown>;
        const realSetInterval = globalThis.setInterval;
        const realFetch = (globalThis as { fetch?: unknown }).fetch;
        g.Worker = class {
            onmessage: unknown = null;
            onerror: unknown = null;
            postMessage = (message: unknown): void => {
                posted.push(message);
            };
        };
        g.document = { addEventListener: (): void => {} };
        // No live timers or network from the imported state module.
        g.setInterval = (() => 0) as unknown as typeof setInterval;
        g.fetch = () => Promise.reject(new Error('offline'));
        try {
            const { propagation } = await import('./propagation');
            // A Proxy like the `$state` array the panel hands over.
            const proxied = new Proxy([3, 1, 2], {});
            propagation.findPasses({
                requestId: 7,
                observer: { latDeg: 47.38, lonDeg: 8.54 },
                startMs: 1,
                endMs: 2,
                originalIndices: proxied as unknown as number[]
            });
            expect(posted.length).toBe(1);
            const message = posted[0] as { type: string; originalIndices: unknown };
            expect(message.type).toBe('passes');
            // Must survive the same structured-clone the Worker post performs.
            const clone = structuredClone(message);
            expect(clone).toEqual({ ...message });
            expect(Array.isArray(message.originalIndices)).toBe(true);
            expect(message.originalIndices).toEqual([3, 1, 2]);
        } finally {
            delete g.Worker;
            delete g.document;
            g.setInterval = realSetInterval;
            if (realFetch !== undefined) g.fetch = realFetch;
            else delete g.fetch;
        }
    });

    test('a raw proxy is indeed uncloneable (documents the constraint)', () => {
        expect(() => structuredClone({ indices: new Proxy([1], {}) })).toThrow();
    });
});
