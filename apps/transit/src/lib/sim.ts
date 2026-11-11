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
 * ETA noise is ±100-400 m, so this is deliberately multi-second: a correction
 * should read as the train briefly speeding up, not as a cut.
 */
const BLEND_TAU_S = 4.0;

/**
 * Corrections are motion too: never move the dot faster than this to absorb one.
 * Twice a train's top speed, so a 100 m correction takes under two seconds while
 * a missed stop (hundreds of metres) takes the fade path instead.
 */
const MAX_BLEND_MPS = 60;

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
            path: (train.path ?? []).map(([t, s, v]) => ({ t, s, v })),
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

    const previous = timelineAt(motion, geometry, at - dt);
    const targetMotion = Math.max(0, target.sTotal - previous.sTotal);
    const error = target.sTotal - motion.sTotal;
    const adopt = motion.reset || Math.abs(error) > HARD_RESET_M;
    let sTotal: number;
    let speed: number;
    if (adopt) {
        // A genuine re-anchor: adopt it. The renderer fades the marker.
        sTotal = target.sTotal;
        speed = 0;
    } else {
        // Always follow the timeline forward; a positive error closes quickly.
        // A negative error only cancels the correction, never the motion, so
        // the dot slows instead of freezing in the middle of the track.
        const correction = Math.max(
            0,
            error * (1 - Math.exp(-dt / BLEND_TAU_S))
        );
        const maxStep = MAX_BLEND_MPS * dt;
        const step = Math.min(maxStep, targetMotion + correction);
        sTotal = motion.sTotal + step;
        speed = step / dt;
    }

    if (!Number.isFinite(sTotal)) sTotal = target.sTotal;
    sTotal = clamp(sTotal, 0, terminal);
    const display = locate(geometry, sTotal);
    // A reset marker fades in from transparent over ~0.7 s, so a skipped-stop
    // re-anchor reads as a blink rather than a teleport.
    const fade = Math.min(1, (adopt ? 0 : motion.fade) + dt / 0.7);
    // `edge` stays the server's timeline anchor; `s` is the display-local
    // distance and may briefly sit on the neighbouring edge while easing.
    return { ...motion, s: display.s, sTotal, v: speed, fade };
}

/**
 * Slice a pattern's shape between two along-track distances.
 *
 * Returns ``[lng, lat]`` pairs including exact endpoints and every shape vertex
 * between them. Used for the selected train's uncertainty bracket: the stretch
 * of track it is known to be on, not a radius around it.
 */
export function sliceAlong(
    geometry: PatternGeometry,
    from: number,
    to: number
): [number, number][] {
    const line = geometry.line;
    const cumulative = geometry.cumulative;
    const count = Math.min(Math.floor(line.length / 2), cumulative.length);
    if (count < 2) return [];

    const total = cumulative[count - 1];
    const limit = geometry.length > 0 ? Math.min(geometry.length, total) : total;
    const low = clamp(Math.min(from, to), 0, limit);
    const high = clamp(Math.max(from, to), 0, limit);
    if (!(high - low > 0.01)) return [];

    const pointAt = (target: number): [number, number] => {
        const first = [line[1], line[0]] as [number, number];
        if (target <= 0) return first;
        const last = [line[(count - 1) * 2 + 1], line[(count - 1) * 2]] as [number, number];
        if (target >= total) return last;
        let a = 0;
        let b = count - 1;
        while (a + 1 < b) {
            const mid = (a + b) >> 1;
            if (cumulative[mid] <= target) a = mid;
            else b = mid;
        }
        const span = cumulative[b] - cumulative[a];
        const t = span > 0 ? (target - cumulative[a]) / span : 0;
        const lat = line[a * 2] + (line[b * 2] - line[a * 2]) * t;
        const lng = line[a * 2 + 1] + (line[b * 2 + 1] - line[a * 2 + 1]) * t;
        return [lng, lat];
    };

    const points: [number, number][] = [pointAt(low)];
    for (let index = 0; index < count; index += 1) {
        const distance = cumulative[index];
        if (distance > low && distance < high) {
            points.push([line[index * 2 + 1], line[index * 2]]);
        }
    }
    points.push(pointAt(high));
    return points;
}

/**
 * The selected train's uncertainty bracket: the current edge, from the stop it
 * left to the next stop it has not reached.
 *
 * Empty while the train is dwelling — its position *is* the platform, and the
 * uncertainty is in the departure time, not in space. Empty at a terminal.
 */
export function bracketSlice(
    motion: TrainMotion,
    geometry: PatternGeometry,
    at: number
): [number, number][] {
    const stops = geometry.stops;
    if (stops.length < 2 || motion.next.length === 0) return [];
    // While dwelling the position is the platform; there is no spatial extent
    // to show, only the departure countdown.
    if (motion.departAt === null || at <= motion.departAt) return [];
    const edge = clamp(motion.edge, 0, stops.length - 2);
    const start = stops[edge].dist;
    const end = stops[edge + 1].dist;
    const span = end - start;
    if (span <= 0) return [];
    const half = Math.max(25, Math.min(motion.sigma > 0 ? motion.sigma : 25, span / 2));
    return sliceAlong(
        geometry,
        Math.max(start, motion.sTotal - half),
        Math.min(end, motion.sTotal + half)
    );
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
