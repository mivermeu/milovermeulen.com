/**
 * Data layer for the transit service: manifest, graph, shape buffer and
 * snapshot, turned into render-ready pattern geometries.
 *
 * Deliberately framework-free (no Svelte, no DOM beyond `fetch` and typed
 * arrays) so it can run under `bun test`.
 */

import type { Graph, GraphManifest, PatternGeometry, Snapshot } from './types';

const DEFAULT_API_BASE = 'https://thehuis.tail4fbfb1.ts.net/transit';

/** Same radius as `services/transit/geo.py`, so our distances agree with the server's `s`. */
const EARTH_RADIUS_M = 6371008.8;

/** One retry for a snapshot that predates a freshly rebuilt graph. */
const SNAPSHOT_ATTEMPTS = 2;

function trimTrailingSlashes(value: string): string {
    return value.replace(/\/+$/, '');
}

/** Base URL of the transit service, without a trailing slash. */
export const API_BASE = trimTrailingSlashes(
    import.meta.env.VITE_TRANSIT_API_URL || DEFAULT_API_BASE
);

function endpoint(base: string, path: string): string {
    return `${trimTrailingSlashes(base)}/${path.replace(/^\/+/, '')}`;
}

async function get(url: string, signal?: AbortSignal): Promise<Response> {
    let response: Response;
    try {
        response = await fetch(url, { signal });
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`GET ${url} failed: ${message}`, { cause: error });
    }
    if (!response.ok) {
        const detail = response.statusText
            ? `${response.status} ${response.statusText}`
            : String(response.status);
        throw new Error(`GET ${url} failed with status ${detail}`);
    }
    return response;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    const response = await get(url, signal);
    return (await response.json()) as T;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dPhi = phi2 - phi1;
    const dLambda = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Metres from the first point to each point of a lat/lon pair array. */
function cumulativeDistances(line: Float32Array): Float32Array {
    const points = Math.floor(line.length / 2);
    const cumulative = new Float32Array(points);
    // Accumulate in float64 and only round on store: float32 accumulation
    // drifts over thousands of points and would misalign with the backend.
    let total = 0;
    for (let point = 1; point < points; point += 1) {
        const previous = (point - 1) * 2;
        const current = point * 2;
        total += haversineM(line[previous], line[previous + 1], line[current], line[current + 1]);
        cumulative[point] = total;
    }
    return cumulative;
}

/**
 * Fetch the raw snapshot document. `base` defaults to {@link API_BASE}.
 */
export async function fetchSnapshot(
    base: string = API_BASE,
    signal?: AbortSignal
): Promise<Snapshot> {
    return getJson<Snapshot>(endpoint(base, 'snapshot.json'), signal);
}

/**
 * Split the little-endian float32 lat/lon buffer into one view per shape.
 *
 * The buffer is validated against the graph first: it must hold exactly
 * `sum(count * 2)` floats, and every shape range must fall inside it.
 */
export function decodeShapes(buffer: ArrayBuffer, graph: Graph): Map<string, Float32Array> {
    const expectedFloats = graph.shapes.reduce((total, shape) => total + shape.count * 2, 0);
    const expectedBytes = expectedFloats * 4;
    if (buffer.byteLength !== expectedBytes) {
        throw new Error(
            `Shape buffer length mismatch: expected ${expectedBytes} bytes ` +
                `(${expectedFloats} floats), got ${buffer.byteLength} bytes`
        );
    }

    // JS typed arrays use platform byte order; every target (browsers, bun)
    // is little-endian like the server's buffer.
    const values = new Float32Array(buffer);
    const decoded = new Map<string, Float32Array>();
    for (const shape of graph.shapes) {
        const start = shape.offset;
        const end = start + shape.count * 2;
        if (start < 0 || end > expectedFloats) {
            throw new Error(
                `Shape ${shape.id} covers floats ${start}..${end}, ` +
                    `but the buffer holds ${expectedFloats}`
            );
        }
        decoded.set(shape.id, values.subarray(start, end));
    }
    return decoded;
}

/**
 * Pair each pattern with its decoded line, cumulative distances and stops.
 *
 * Patterns referring to a shape that is not in `shapes` are skipped: serving a
 * pattern without geometry would break rendering, and one stale pattern should
 * not blank the whole map.
 */
export function buildGeometries(
    graph: Graph,
    shapes: Map<string, Float32Array>
): Map<string, PatternGeometry> {
    const geometries = new Map<string, PatternGeometry>();
    for (const pattern of graph.patterns) {
        const line = shapes.get(pattern.shape);
        if (!line) {
            continue;
        }
        const cumulative = cumulativeDistances(line);
        geometries.set(pattern.id, {
            id: pattern.id,
            route: pattern.route,
            dir: pattern.dir,
            length: cumulative.length === 0 ? 0 : cumulative[cumulative.length - 1],
            stops: pattern.stops.map(([stop, dist]) => ({ stop, dist })),
            line,
            cumulative
        });
    }
    return geometries;
}

export interface TransitData {
    manifest: GraphManifest;
    graph: Graph;
    /** The whole shape buffer; `decodeShapes` gives the per-shape slices. */
    shapes: Float32Array;
    snapshot: Snapshot;
    geometries: Map<string, PatternGeometry>;
    byRoute: Map<string, PatternGeometry[]>;
}

async function loadConsistentSnapshot(
    base: string,
    hash: string,
    signal?: AbortSignal
): Promise<Snapshot> {
    let lastGraph: string | null = null;
    for (let attempt = 0; attempt < SNAPSHOT_ATTEMPTS; attempt += 1) {
        const snapshot = await fetchSnapshot(base, signal);
        if (snapshot.graph === hash) {
            return snapshot;
        }
        lastGraph = snapshot.graph;
    }
    const url = endpoint(base, 'snapshot.json');
    throw new Error(
        `GET ${url} is out of date: snapshot graph ${lastGraph ?? 'null'} does not match ` +
            `manifest hash ${hash} after ${SNAPSHOT_ATTEMPTS} attempts`
    );
}

/**
 * Load the manifest first, then the graph, shape buffer and snapshot
 * concurrently. The snapshot must match the manifest hash; a rebuild between
 * writes gets one refetch before failing.
 */
export async function loadTransitData(
    options: { base?: string; signal?: AbortSignal } = {}
): Promise<TransitData> {
    const base = options.base ?? API_BASE;
    const signal = options.signal;

    const manifest = await getJson<GraphManifest>(endpoint(base, 'graph.json'), signal);
    const [graph, buffer, snapshot] = await Promise.all([
        getJson<Graph>(endpoint(base, manifest.graph), signal),
        get(endpoint(base, manifest.shapes), signal).then((response) => response.arrayBuffer()),
        loadConsistentSnapshot(base, manifest.hash, signal)
    ]);

    const shapes = decodeShapes(buffer, graph);
    const geometries = buildGeometries(graph, shapes);
    const byRoute = new Map<string, PatternGeometry[]>();
    for (const geometry of geometries.values()) {
        const patterns = byRoute.get(geometry.route);
        if (patterns) {
            patterns.push(geometry);
        } else {
            byRoute.set(geometry.route, [geometry]);
        }
    }

    return {
        manifest,
        graph,
        shapes: new Float32Array(buffer),
        snapshot,
        geometries,
        byRoute
    };
}
