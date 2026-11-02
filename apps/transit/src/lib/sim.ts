/**
 * Client-side train motion.
 *
 * The server ships a trajectory, not a position: the edge the train is on, the
 * time it leaves that edge's start, and the arrival/departure times of the next
 * few stops. Between 30 s polls the map evaluates that timeline, so motion is a
 * function of wall-clock time rather than a velocity integrated per frame.
 *
 * A new snapshot replaces the timeline, not the dot. The displayed `sTotal` eases
 * toward the new timeline's value at the current instant, so a correction reads
 * as a brief change of speed instead of a teleport. `reset` (a genuinely large
 * re-anchor) skips the ease and is faded by the renderer.
 *
 * All coordinates here are WGS84. `positionAt` returns MapLibre's `[lng, lat]`
 * order even though the shape buffer stores lat/lon pairs.
 */

import type { PatternGeometry, Snapshot, TrainMotion } from './types';

/** Must match `services/transit/geo.py`, or shipped distances will disagree. */
const EARTH_RADIUS_M = 6371008.8;

/** Must match `services/transit/estimator.py`: trapezoid acceleration fraction. */
const ACCEL_FRACTION = 0.18;

/**
 * Time constant for blending a corrected timeline back onto the displayed dot.
 * Small enough to hide a correction, large enough not to look like a cut.
 */
const BLEND_TAU_S = 0.35;

/**
 * Corrections are motion too: never move the dot faster than this to absorb one.
 * It is above any train speed on purpose — the cap exists to bound visual jumps,
 * not to model traction.
 */
const MAX_BLEND_MPS = 240;

/**
 * Above this the displayed dot is simply in the wrong place (a skipped stop, a
 * feed gap). Adopt and fade instead of gliding half a kilometre.
 */
const HARD_RESET_M = 400;

const DEG = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

/** Distance in metres to the end of a pattern's last real stop. */
export function terminalS(geometry: PatternGeometry): number {
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
 * Trapezoidal speed profile: accelerate, cruise, brake. Returns the fraction of
 * the edge covered and the normalised speed at `elapsed` seconds into `run`.
 * Mirrors `estimator.profile`, so server and client agree on where a train is.
 */
export function profile(elapsed: number, run: number): [fraction: number, speed: number] {
    if (!(run > 0) || elapsed <= 0) return [0, 0];
    if (elapsed >= run) return [1, 0];
    const taper = Math.max(1e-6, run * ACCEL_FRACTION);
    const cruise = 1 / (run - taper);
    if (elapsed < taper) {
        return [(0.5 * cruise * elapsed * elapsed) / taper, (cruise * elapsed) / taper];
    }
    if (elapsed < run - taper) {
        return [0.5 * cruise * taper + cruise * (elapsed - taper), cruise];
    }
    const remaining = run - elapsed;
    return [1 - (0.5 * cruise * remaining * remaining) / taper, (cruise * remaining) / taper];
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
        const departAt =
            typeof train.depart_at === 'number' && Number.isFinite(train.depart_at)
                ? train.depart_at
                : null;

        trains.set(train.id, {
            id: train.id,
            pattern: train.pattern,
            edge,
            s: clamp(sTotal - geometry.stops[edge].dist, 0, edgeLength(geometry, edge)),
            sTotal,
            v: typeof train.v === 'number' && Number.isFinite(train.v) ? Math.max(0, train.v) : 0,
            confidence: clamp(train.confidence, 0, 1),
            stale: train.stale === true,
            reset: train.reset === true,
            route: train.route,
            dir: train.dir,
            status: train.status,
            stop: train.stop,
            next: train.next ?? [],
            departAt,
            sigma:
                typeof train.sigma === 'number' && Number.isFinite(train.sigma) ? train.sigma : 0,
            fade: train.reset === true ? 0 : 1,
            observedAt
        });
    }

    return trains;
}

interface TimelinePoint {
    sTotal: number;
    v: number;
}

/**
 * Where the timeline puts the train at `at` seconds (unix time).
 *
 * The current edge runs from the server's `edge` start at `departAt` to the
 * first `next` arrival; later entries are dwell + run pairs. A missing timeline
 * (no `next`) pins the train to its last known distance rather than guessing.
 */
export function timelineAt(
    motion: TrainMotion,
    geometry: PatternGeometry,
    at: number
): TimelinePoint {
    const stops = geometry.stops;
    if (stops.length < 2) return { sTotal: motion.sTotal, v: 0 };

    const edge = clamp(motion.edge, 0, stops.length - 2);
    const start = stops[edge].dist;
    const startAt = motion.departAt ?? motion.observedAt;

    if (motion.next.length === 0) {
        // Terminal, or a server that could not project a timeline.
        return { sTotal: Math.min(motion.sTotal, terminalS(geometry)), v: 0 };
    }

    if (at <= startAt) return { sTotal: start, v: 0 };

    let fromIndex = edge;
    let fromAt = startAt;
    for (let index = 0; index < motion.next.length; index += 1) {
        const arrival = motion.next[index].arr;
        if (arrival === null || !Number.isFinite(arrival)) break;
        const toIndex = Math.min(edge + 1 + index, stops.length - 1);
        const span = Math.max(0, stops[toIndex].dist - stops[fromIndex].dist);

        if (at <= arrival) {
            const run = Math.max(1, arrival - fromAt);
            const [fraction, speed] = profile(at - fromAt, run);
            return { sTotal: stops[fromIndex].dist + fraction * span, v: speed * span };
        }
        const departure = motion.next[index].dep;
        if (departure !== null && Number.isFinite(departure) && at <= departure) {
            return { sTotal: stops[toIndex].dist, v: 0 };
        }
        if (departure === null || !Number.isFinite(departure)) {
            // No dwell information: continue from the arrival.
            fromIndex = toIndex;
            fromAt = arrival;
        } else {
            fromIndex = toIndex;
            fromAt = departure;
        }
    }

    return { sTotal: stops[Math.min(fromIndex, stops.length - 1)].dist, v: 0 };
}

/** Edge and local distance for an absolute `sTotal`. */
function locate(geometry: PatternGeometry, sTotal: number): { edge: number; s: number } {
    const stops = geometry.stops;
    const terminal = terminalS(geometry);
    const value = clamp(sTotal, 0, terminal);
    let edge = 0;
    while (edge + 1 < stops.length - 1 && stops[edge + 1].dist <= value) edge += 1;
    return { edge, s: clamp(value - stops[edge].dist, 0, edgeLength(geometry, edge)) };
}

/**
 * Advance the displayed dot by `dt` seconds, at wall-clock `at`.
 *
 * The target comes from the timeline; the displayed position follows it with a
 * first-order lag, capped so a correction cannot teleport. Returns the same
 * object when there is nothing to do.
 */
export function advance(
    motion: TrainMotion,
    dt: number,
    geometry: PatternGeometry,
    at: number
): TrainMotion {
    if (!Number.isFinite(dt) || dt <= 0) return motion;
    const target = timelineAt(motion, geometry, at);
    const terminal = terminalS(geometry);

    const error = target.sTotal - motion.sTotal;
    const adopt = motion.reset || Math.abs(error) > HARD_RESET_M;
    let sTotal: number;
    if (adopt) {
        // A genuine re-anchor: adopt it. The renderer fades the marker.
        sTotal = target.sTotal;
    } else {
        const blend = 1 - Math.exp(-dt / BLEND_TAU_S);
        const maxStep = MAX_BLEND_MPS * dt;
        const step = clamp(error * blend, -maxStep, maxStep);
        sTotal = motion.sTotal + step;
    }

    if (!Number.isFinite(sTotal)) sTotal = target.sTotal;
    sTotal = clamp(sTotal, 0, terminal);
    const display = locate(geometry, sTotal);
    // A reset marker fades in from transparent over ~0.7 s, so a skipped-stop
    // re-anchor reads as a blink rather than a teleport.
    const fade = Math.min(1, (adopt ? 0 : motion.fade) + dt / 0.7);
    // `edge` stays the server's timeline anchor; `s` is the display-local
    // distance and may briefly sit on the neighbouring edge while easing.
    return { ...motion, s: display.s, sTotal, v: target.v, fade };
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
