import { describe, expect, test } from 'bun:test';

import { API_BASE, buildGeometries, decodeShapes, fetchSnapshot, loadTransitData } from './data';
import type { Graph, GraphManifest, Snapshot } from './types';

const DEFAULT_BASE = 'https://thehuis.tail4fbfb1.ts.net/transit';

/** Metres along the equator for 0.001 degrees, i.e. one point step below. */
const MILLIDEGREE_M = ((6371008.8 * Math.PI) / 180) * 0.001;

/** Floats in the synthetic shape buffer: shape A (2 points) then B (3 points). */
const SHAPE_VALUES = [0, 0, 0, 0.001, 10, 20, 10.001, 20, 10.002, 20];

function shapeBuffer(): ArrayBuffer {
    return new Float32Array(SHAPE_VALUES).buffer;
}

function graphFixture(): Graph {
    return {
        v: 1,
        built_at: 1700000000,
        feed_version: 'test',
        stations: [],
        platforms: [],
        shapes: [
            { id: 'sA', offset: 0, count: 2, length_m: 111.2 },
            { id: 'sB', offset: 4, count: 3, length_m: 444.8 }
        ],
        patterns: [
            {
                id: 'A-N',
                route: 'A',
                dir: 'N',
                shape: 'sA',
                length_m: 111.2,
                stops: [
                    ['stop1', 0],
                    ['stop2', 111.2]
                ]
            },
            {
                id: 'A-S',
                route: 'A',
                dir: 'S',
                shape: 'sB',
                length_m: 444.8,
                stops: [
                    ['stop3', 0],
                    ['stop2', 222.4],
                    ['stop1', 444.8]
                ]
            },
            {
                id: 'stale',
                route: 'B',
                dir: 'N',
                shape: 'missing',
                length_m: 0,
                stops: []
            }
        ]
    };
}

function manifestFixture(): GraphManifest {
    return {
        v: 1,
        hash: 'abc123',
        graph: 'graph-abc123.json',
        shapes: 'shapes-abc123.bin',
        built_at: 1700000000,
        feed_version: 'test',
        patterns: 3,
        shapes_count: 2
    };
}

function snapshotFixture(graph: string | null): Snapshot {
    return {
        v: 1,
        generated_at: 1700000100,
        header_ts: null,
        graph,
        feeds: {},
        scheduled_trips: 0,
        estimated: 0,
        trains: [],
        alerts: []
    };
}

function json(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' }
    });
}

function floats(values: ArrayLike<number>): number[] {
    return Array.from(values);
}

/** Serve fixed routes and record every requested URL. */
function stubFetch(routes: Record<string, () => Response>, calls: string[]): typeof fetch {
    return (async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        const route = routes[url];
        if (!route) {
            throw new Error(`unexpected fetch: ${url}`);
        }
        return route();
    }) as typeof fetch;
}

describe('API_BASE', () => {
    test('defaults to the service URL without a trailing slash', () => {
        expect(API_BASE).toBe(DEFAULT_BASE);
        expect(API_BASE.endsWith('/')).toBe(false);
    });
});

describe('decodeShapes', () => {
    test('slices the buffer by float offset and count', () => {
        const decoded = decodeShapes(shapeBuffer(), graphFixture());

        expect(decoded.size).toBe(2);
        expect(floats(decoded.get('sA')!)).toEqual(floats(new Float32Array([0, 0, 0, 0.001])));
        expect(floats(decoded.get('sB')!)).toEqual(
            floats(new Float32Array([10, 20, 10.001, 20, 10.002, 20]))
        );
        expect(decoded.get('sB')!.length).toBe(6);
    });

    test('rejects a buffer whose length does not match the graph', () => {
        const graph = graphFixture();

        expect(() => decodeShapes(new Float32Array(11).buffer, graph)).toThrow(
            /Shape buffer length mismatch: expected 40 bytes/
        );
        expect(() => decodeShapes(new Float32Array(9).buffer, graph)).toThrow(/got 36 bytes/);
    });

    test('rejects a shape range that runs past the buffer', () => {
        const graph = graphFixture();
        graph.shapes[1].offset = 8;

        expect(() => decodeShapes(shapeBuffer(), graph)).toThrow(/Shape sB covers floats 8\.\.14/);
    });
});

describe('buildGeometries', () => {
    test('maps patterns to lines, cumulative distances and stops', () => {
        const graph = graphFixture();
        const geometries = buildGeometries(graph, decodeShapes(shapeBuffer(), graph));

        expect(geometries.size).toBe(2);
        const north = geometries.get('A-N')!;
        expect(north.id).toBe('A-N');
        expect(north.route).toBe('A');
        expect(north.dir).toBe('N');
        expect(floats(north.line)).toEqual(floats(new Float32Array([0, 0, 0, 0.001])));
        expect(floats(north.cumulative).length).toBe(2);
        expect(north.cumulative[0]).toBe(0);
        expect(north.cumulative[1]).toBeCloseTo(MILLIDEGREE_M, 1);
        expect(north.length).toBe(north.cumulative[north.cumulative.length - 1]);
        expect(north.length).toBeCloseTo(MILLIDEGREE_M, 1);
        expect(north.stops).toEqual([
            { stop: 'stop1', dist: 0 },
            { stop: 'stop2', dist: 111.2 }
        ]);
    });

    test('keeps cumulative distances monotonic along the line', () => {
        const graph = graphFixture();
        const south = buildGeometries(graph, decodeShapes(shapeBuffer(), graph)).get('A-S')!;

        expect(south.cumulative.length).toBe(3);
        expect(south.cumulative[0]).toBe(0);
        for (let index = 1; index < south.cumulative.length; index += 1) {
            expect(south.cumulative[index]).toBeGreaterThan(south.cumulative[index - 1]);
            expect(south.cumulative[index]).toBeLessThanOrEqual(south.length);
        }
        expect(south.cumulative[2]).toBeCloseTo(MILLIDEGREE_M * 2, 1);
        expect(south.length).toBeCloseTo(MILLIDEGREE_M * 2, 1);
        expect(south.stops.map((stop) => stop.stop)).toEqual(['stop3', 'stop2', 'stop1']);
    });

    test('skips patterns whose shape is not in the buffer', () => {
        const graph = graphFixture();
        const geometries = buildGeometries(graph, decodeShapes(shapeBuffer(), graph));

        expect(geometries.has('stale')).toBe(false);
        expect(geometries.has('A-N')).toBe(true);
        expect(geometries.has('A-S')).toBe(true);
    });
});

describe('fetchSnapshot', () => {
    test('requests snapshot.json under the given base', async () => {
        const original = globalThis.fetch;
        const calls: string[] = [];
        try {
            globalThis.fetch = stubFetch(
                {
                    'https://example.test/transit/snapshot.json': () =>
                        json(snapshotFixture('abc123'))
                },
                calls
            );

            const snapshot = await fetchSnapshot('https://example.test/transit/');

            expect(snapshot.graph).toBe('abc123');
            expect(calls).toEqual(['https://example.test/transit/snapshot.json']);
        } finally {
            globalThis.fetch = original;
        }
    });
});

describe('loadTransitData', () => {
    test('loads the manifest first, then graph, shapes and snapshot', async () => {
        const original = globalThis.fetch;
        const calls: string[] = [];
        const manifest = manifestFixture();
        const graph = graphFixture();
        let snapshotCalls = 0;
        try {
            globalThis.fetch = stubFetch(
                {
                    [`${DEFAULT_BASE}/graph.json`]: () => json(manifest),
                    [`${DEFAULT_BASE}/graph-abc123.json`]: () => json(graph),
                    [`${DEFAULT_BASE}/shapes-abc123.bin`]: () => new Response(shapeBuffer()),
                    [`${DEFAULT_BASE}/snapshot.json`]: () => {
                        snapshotCalls += 1;
                        return json(snapshotFixture(snapshotCalls === 1 ? 'old' : manifest.hash));
                    }
                },
                calls
            );

            const data = await loadTransitData({ base: `${DEFAULT_BASE}/` });

            expect(calls[0]).toBe(`${DEFAULT_BASE}/graph.json`);
            expect(snapshotCalls).toBe(2);
            expect(data.manifest).toEqual(manifest);
            expect(data.graph).toEqual(graph);
            expect(data.snapshot.graph).toBe(manifest.hash);
            expect(floats(data.shapes)).toEqual(floats(new Float32Array(SHAPE_VALUES)));
            expect(data.geometries.size).toBe(2);
            expect(data.byRoute.get('A')).toHaveLength(2);
            expect(data.byRoute.has('B')).toBe(false);
            expect(data.byRoute.get('A')!.map((geometry) => geometry.id)).toEqual(['A-N', 'A-S']);
        } finally {
            globalThis.fetch = original;
        }
    });

    test('fails after two snapshots that do not match the manifest hash', async () => {
        const original = globalThis.fetch;
        const calls: string[] = [];
        const manifest = manifestFixture();
        let snapshotCalls = 0;
        try {
            globalThis.fetch = stubFetch(
                {
                    [`${DEFAULT_BASE}/graph.json`]: () => json(manifest),
                    [`${DEFAULT_BASE}/graph-abc123.json`]: () => json(graphFixture()),
                    [`${DEFAULT_BASE}/shapes-abc123.bin`]: () => new Response(shapeBuffer()),
                    [`${DEFAULT_BASE}/snapshot.json`]: () => {
                        snapshotCalls += 1;
                        return json(snapshotFixture('old'));
                    }
                },
                calls
            );

            const error = await loadTransitData({ base: DEFAULT_BASE }).catch((caught) => caught);

            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain(`${DEFAULT_BASE}/snapshot.json`);
            expect((error as Error).message).toContain('old');
            expect((error as Error).message).toContain(manifest.hash);
            expect(snapshotCalls).toBe(2);
        } finally {
            globalThis.fetch = original;
        }
    });

    test('reports the failing URL and status', async () => {
        const original = globalThis.fetch;
        try {
            globalThis.fetch = stubFetch(
                {
                    [`${DEFAULT_BASE}/graph.json`]: () =>
                        new Response('down', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        })
                },
                []
            );

            const error = await loadTransitData({ base: DEFAULT_BASE }).catch((caught) => caught);

            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain(`${DEFAULT_BASE}/graph.json`);
            expect((error as Error).message).toContain('503');
        } finally {
            globalThis.fetch = original;
        }
    });
});
