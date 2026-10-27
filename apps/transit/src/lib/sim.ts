/**
 * Client-side train simulation.
 *
 * Snapshots arrive every ~30 s; between them the map has to keep moving. Each
 * train carries an `s_total` (metres from the start of its pattern) and a
 * velocity, so extrapolating is just `s_total += v * dt` — re-deriving which
 * stop-to-stop edge that lands on, and stopping at the terminal instead of
 * sliding past it.
 *
 * `s_total` is measured against the pattern's stop distances, not the shape
 * length: the server's pattern length is the distance to the last stop, and a
 * shape often runs a little past it.
 *
 * All coordinates here are WGS84. `positionAt` returns MapLibre's `[lng, lat]`
 * order even though the shape buffer stores lat/lon pairs.
 */

import type { PatternGeometry, Snapshot, TrainMotion } from './types';

/** Must match `services/transit/geo.py`, or shipped distances will disagree. */
const EARTH_RADIUS_M = 6371008.8;

const DEG = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

/** Distance in metres to the end of a pattern's last real stop. */
function terminalS(geometry: PatternGeometry): number {
    const stops = geometry.stops;
    const last = stops.length > 0 ? stops[stops.length - 1].dist : geometry.length;
    return Number.isFinite(last) ? last : 0;
}

/** Distance in metres covered by the current edge; 0 for a degenerate edge. */
function edgeLength(geometry: PatternGeometry, index: number): number {
    const stops = geometry.stops;
    if (index < 0 || index + 1 >= stops.length) return 0;
    const span = stops[index + 1].dist - stops[index].dist;
    return Number.isFinite(span) && span > 0 ? span : 0;
}

/**
 * Parse the index out of `<pattern>:<index>:<fromStop>><toStop>`.
 *
 * The pattern id is opaque but never contains a colon in practice, and stop ids
 * never do, so splitting from the right is both simple and tolerant of future
 * pattern ids that do.
 */
function parseEdgeIndex(edge: string): number | null {
    const last = edge.lastIndexOf(':');
    if (last <= 0) return null;
    const indexAt = edge.lastIndexOf(':', last - 1);
    if (indexAt <= 0) return null;
    const rawIndex = edge.slice(indexAt + 1, last);
    if (!/^[0-9]+$/.test(rawIndex)) return null;
    const hops = edge.slice(last + 1);
    const arrow = hops.indexOf('>');
    if (arrow <= 0 || arrow === hops.length - 1) return null;
    const index = Number(rawIndex);
    return Number.isSafeInteger(index) ? index : null;
}

/** Build client motion state from one snapshot, dropping anything unusable. */
export function fromSnapshot(
    snapshot: Snapshot,
    geometries: Map<string, PatternGeometry>,
    now?: number
): Map<string, TrainMotion> {
    const observedAt = Number.isFinite(snapshot.generated_at)
        ? snapshot.generated_at
        : (now ?? Date.now() / 1000);
    const trains = new Map<string, TrainMotion>();

    for (const train of snapshot.trains) {
        if (!train.id || !train.pattern || !train.edge) continue;
        if (typeof train.s_total !== 'number' || !Number.isFinite(train.s_total)) continue;
        const geometry = geometries.get(train.pattern);
        if (!geometry || geometry.stops.length < 2) continue;

        const edge = parseEdgeIndex(train.edge);
        // An index past the last real edge cannot be sliced against this shape,
        // which means the client and server disagree about the graph.
        if (edge === null || edge > geometry.stops.length - 2) continue;

        const sTotal = clamp(train.s_total, 0, terminalS(geometry));
        const start = geometry.stops[edge].dist;
        const s = clamp(sTotal - start, 0, edgeLength(geometry, edge));
        const v =
            typeof train.v === 'number' && Number.isFinite(train.v) ? Math.max(0, train.v) : 0;

        trains.set(train.id, {
            id: train.id,
            pattern: train.pattern,
            edge,
            s,
            sTotal,
            v,
            confidence: clamp(train.confidence, 0, 1),
            stale: train.stale === true,
            reset: train.reset === true,
            route: train.route,
            dir: train.dir,
            status: train.status,
            stop: train.stop,
            next: train.next ?? [],
            observedAt
        });
    }

    return trains;
}

/**
 * Extrapolate a train by `dt` seconds along its pattern.
 *
 * Returns the same object when there is nothing to do (non-positive or
 * non-finite `dt`, a stopped train), so callers can skip re-rendering.
 */
export function advance(motion: TrainMotion, dt: number, geometry: PatternGeometry): TrainMotion {
    if (!Number.isFinite(dt) || dt <= 0) return motion;

    const stops = geometry.stops;
    const terminal = terminalS(geometry);
    const velocity = Number.isFinite(motion.v) && motion.v > 0 ? motion.v : 0;
    if (velocity === 0) return motion;

    if (stops.length < 2) {
        // Nothing to place the train on: park it at the end of the pattern.
        return { ...motion, sTotal: terminal, v: 0 };
    }

    // Never backwards, never past the terminal.
    const base = clamp(motion.sTotal, 0, terminal);
    const sTotal = Math.min(base + velocity * dt, terminal);
    const lastEdge = stops.length - 2;

    let edge = clamp(Math.floor(motion.edge), 0, lastEdge);
    while (edge < lastEdge && stops[edge + 1].dist <= sTotal) edge += 1;

    const start = stops[edge].dist;
    const s = clamp(sTotal - start, 0, edgeLength(geometry, edge));
    const atTerminal = sTotal >= terminal;

    return {
        ...motion,
        edge,
        s,
        sTotal,
        v: atTerminal ? 0 : velocity
    };
}

/**
 * Interpolate a lat/lon along a pattern shape at `sTotal` metres.
 *
 * The shape buffer is lat/lon pairs, but MapLibre wants `[lng, lat]`, so the
 * returned object is deliberately in lng-lat order.
 */
export function positionAt(
    geometry: PatternGeometry,
    sTotal: number
): { lng: number; lat: number } {
    const line = geometry.line;
    const cumulative = geometry.cumulative;
    const count = Math.min(Math.floor(line.length / 2), cumulative.length);
    // A geometry with no usable points cannot be placed; NaN keeps the caller
    // from drawing it at the origin.
    if (count <= 0) return { lng: Number.NaN, lat: Number.NaN };

    const latAt = (index: number): number => line[index * 2];
    const lonAt = (index: number): number => line[index * 2 + 1];

    const total = cumulative[count - 1];
    // A pattern's length is its last stop distance, which may sit short of the
    // shape end; never extrapolate past either one.
    const limit = geometry.length > 0 ? Math.min(geometry.length, total) : total;
    const target = Number.isFinite(sTotal) ? clamp(sTotal, 0, limit) : 0;

    if (count === 1 || target <= 0) {
        return { lng: lonAt(0), lat: latAt(0) };
    }
    if (target >= total) {
        return { lng: lonAt(count - 1), lat: latAt(count - 1) };
    }

    let low = 0;
    let high = count - 1;
    while (low + 1 < high) {
        const mid = (low + high) >> 1;
        if (cumulative[mid] <= target) low = mid;
        else high = mid;
    }

    const span = cumulative[high] - cumulative[low];
    const t = span > 0 ? (target - cumulative[low]) / span : 0;
    const lat = latAt(low) + (latAt(high) - latAt(low)) * t;
    const lng = lonAt(low) + (lonAt(high) - lonAt(low)) * t;
    return { lng, lat };
}

/** Great-circle distance in metres, on the backend's earth radius. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const phi1 = lat1 * DEG;
    const phi2 = lat2 * DEG;
    const dPhi = phi2 - phi1;
    const dLambda = (lon2 - lon1) * DEG;
    const a =
        Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    // Floating point can push `a` a hair past 1 for antipodal points; clamp
    // without swallowing a NaN from a bad input.
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}
