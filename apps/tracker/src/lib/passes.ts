import {
    eciToEcf,
    ecfToLookAngles,
    gstime,
    propagate,
    type EcfVec3,
    type LookAngles,
    type SatRec
} from 'satellite.js';
import { secularRates } from './orbit';
import type { EciVec3 } from 'satellite.js';

/**
 * Location-centric pass finding: "which of these satellites will pass above
 * observer X in the next N days, and how high?"
 *
 * The algorithm is a standard three-stage detector:
 *
 *  1. A static orbit-plane screen discards satellites whose orbit plane can
 *     never come within the elevation's horizon cone of the observer (zero
 *     SGP4 calls for them).
 *  2. Coarse SGP4 position stepping per satellite, at that satellite's own
 *     cadence: the step is bounded by how long the satellite can possibly
 *     stay above the elevation threshold within one pass (derived from its
 *     period and max radius), so every pass renders at least ~3 coarse
 *     samples and is never skipped whole.
 *  3. Above-threshold runs are refined with true SGP4 look angles — rise/set
 *     crossings bisection'd to the exact `minElDeg` boundary, and the maximum
 *     elevation located by golden-section search.
 *
 * Refinement runs in global chronological order (a min-heap over the
 * satellites' next coarse sample times), so the search stops as soon as the
 * top-N-by-start list can no longer be beaten by a later-discovered pass.
 * Large sets therefore cost a handful of coarse samples per satellite instead
 * of a full 7-day sweep; tiny sets cost one inexpensive sweep per satellite.
 *
 * Known tolerance: ultra-short grazes (a satellite popping above the
 * threshold for less than one coarse step) can slip between samples. With
 * step = maxDuration/3 that means grazes below ~2.5 minutes for LEO — all of
 * them low-elevation, low-value passes near the 10° ring.
 */

const EARTH_RADIUS_KM = 6378.137;
const MU_KM3_S2 = 398600.4418;
const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
// Earth's sidereal rotation rate (rad/s). Always added to the satellite's
// inertial rate when bounding how fast the observer-to-satellite geometry can
// change — correct for prograde, conservative for retrograde.
const OMEGA_EARTH = 7.2921159553e-5;
const JULIAN_UNIX_EPOCH = 2440587.5;

/** satellite.js stores rec.no in rad/MINUTE; convert helpers. */
const meanMotionRadPerSec = (rec: SatRec): number => rec.no / 60;
/** Semi-major axis (km) implied by the TLE's mean motion (quasi-Kepler via a). */
function semiMajorAxisKm(rec: SatRec): number {
    const n = meanMotionRadPerSec(rec);
    return Math.cbrt(MU_KM3_S2 / (n * n));
}

/** Higher-altitude bodies (GEO) coarse-step at most every hour. */
const MAX_STEP_MS = 3_600_000;
/** Bisection convergence for rise/set times (milliseconds). */
const BISECT_TOL_MS = 20;
const BISECT_MAX_ITERS = 30;
/** Golden-section cap for the maximum-elevation search. */
const MAX_EL_MAX_ITERS = 60;
/** Global coarse-sample budget; past it the search reports a partial result. */
const MAX_COARSE_SAMPLES = 2_000_000;
/** Heartbeat cadence: coarse samples evaluated per generator yield. */
const YIELD_EVERY = 400;

export interface ObserverLocation {
    /** Geodetic latitude, degrees north. */
    latDeg: number;
    /** Geodetic longitude, degrees east. */
    lonDeg: number;
}

/**
 * HOOK POINT for pass visibility gating (owned by the sunlight/terminator
 * feature): supply e.g. "satellite sunlit AND observer local darkness" to
 * restrict the search to optically visible passes. Return false for a sample
 * that must not count; the search then treats that sample as below-horizon,
 * so-gated spans are excluded from detection and refinement alike.
 *
 * Callables cannot cross postMessage, so the Web Worker wires this up itself
 * rather than receiving it in a request message (see sgp4.worker.ts).
 */
export type PassVisibilityGate = (visibility: {
    /** Absolute sample time (ms). */
    tMs: number;
    /** Satellite ECF position (km). */
    ecf: EcfVec3<number>;
    /** Look angles from the observer (radians). */
    look: LookAngles;
}) => boolean;

/** One satellite the search evaluates: its record plus app-level identity. */
export interface PassCandidate {
    /** Display name, e.g. "ISS (ZARYA)". */
    name: string;
    /** Parsed TLE record. */
    rec: SatRec;
    /** Index into the app's unfiltered catalog (used for pinning). */
    index: number;
}

export interface PassRow {
    /** Index into the app's unfiltered catalog. */
    index: number;
    name: string;
    /** Rise time (ms); clipped to the window if the pass was already underway. */
    startMs: number;
    /** Set time (ms); clipped to the window if the pass outlasts it. */
    endMs: number;
    /** Time of the maximum-elevation point (ms). */
    maxElAtMs: number;
    /** Maximum elevation during the pass, degrees (true geometric, ungated). */
    maxElDeg: number;
    /** Azimuth at rise, degrees [0, 360). */
    startAzDeg: number;
    /** Elevation at rise, degrees. */
    startElDeg: number;
    /** Azimuth at set, degrees [0, 360). */
    endAzDeg: number;
}

export interface PassSearchParams {
    candidates: PassCandidate[];
    observer: ObserverLocation;
    /** Inclusive search window start (ms). */
    startMs: number;
    /** Search window end (ms); passes may set a little past it. */
    endMs: number;
    /** Minimum elevation for a pass, degrees (default 10). */
    minElDeg?: number;
    /** Maximum number of passes returned, ordered by start time (default 20). */
    maxPasses?: number;
    /** Optional visibility gate — see {@link PassVisibilityGate}. */
    gate?: PassVisibilityGate;
    /**
     * Optional wall-clock budget (ms) for the whole search. Past it the search
     * finalizes the runs it has and reports `partial: true`. Undefined means
     * unlimited (tests, or when the caller enforces its own budget).
     */
    wallBudgetMs?: number;
}

/** Periodic heartbeat with the number of coarse samples evaluated so far. */
export interface PassSearchProgress {
    processed: number;
}

/** Max elevation search uses the golden-section conjugate. */
const INV_PHI = (Math.sqrt(5) - 1) / 2;

export interface PassSearchResult {
    /** Passes above the elevation threshold, sorted by start, at most `maxPasses`. */
    passes: PassRow[];
    /** True when the search stopped early (sample budget) — results are incomplete. */
    partial: boolean;
}

/**
 * Preselect the satellite list for the search: keep propagable records, sort
 * by orbital period ascending (shortest period = lowest orbit first) and cap
 * the count. Returns counts the UI can surface as a "limited to N" note.
 */
export function capCandidates(
    candidates: PassCandidate[],
    maxSats: number
): { capped: PassCandidate[]; active: number; searched: number } {
    const usable = candidates.filter((c) => c.rec.no > 0);
    // Mean motion ascending = shortest period = lowest orbit first.
    const sorted = [...usable].sort((a, b) => b.rec.no - a.rec.no || a.index - b.index);
    const capped = sorted.slice(0, Math.max(0, maxSats));
    return { capped, active: candidates.length, searched: capped.length };
}

interface ObserverGd {
    latitude: number;
    longitude: number;
    height: number;
}

/** Look angles of `rec` from `observerGd` at `tMs`; null when SGP4 fails. */
function lookAnglesAt(
    rec: SatRec,
    tMs: number,
    observerGd: ObserverGd,
    gate: PassVisibilityGate | undefined
): { look: LookAngles; visible: boolean } | null {
    const pv = propagate(rec, new Date(tMs));
    if (pv.position === false || pv.position === undefined) return null;
    const ecf = eciToEcf(pv.position as EciVec3<number>, gstime(new Date(tMs)));
    const look = ecfToLookAngles(observerGd, ecf);
    return { look, visible: gate ? gate({ tMs, ecf, look }) : true };
}

/**
 * Effective elevation (degrees): the true geometric elevation when the sample
 * is usable, and −90 when SGP4 failed or the visibility gate rejects it.
 * Pass detection runs entirely on this function, so gating always splits a
 * pass exactly where the gate toggles.
 */
function effectiveElevationDeg(
    rec: SatRec,
    tMs: number,
    observerGd: ObserverGd,
    gate: PassVisibilityGate | undefined
): number {
    const la = lookAnglesAt(rec, tMs, observerGd, gate);
    if (!la || !la.visible) return -90;
    return la.look.elevation * RAD2DEG;
}

/** Az/el in degrees at an exact time; used only on propagable states. */
function lookDegAt(rec: SatRec, tMs: number, observerGd: ObserverGd): { az: number; el: number } {
    const la = lookAnglesAt(rec, tMs, observerGd, undefined);
    if (!la) return { az: NaN, el: NaN };
    const az = (((la.look.azimuth * RAD2DEG) % 360) + 360) % 360;
    return { az, el: la.look.elevation * RAD2DEG };
}

/**
 * Largest geocentric angle ψ (degrees), for any surface observer, at which a
 * satellite at radius `radiusKm` is at or above `minElDeg` elevation.
 * From `tan e = (r·cos ψ − R) / (r·sin ψ)`:  ψ = arccos((R/r)·cos e) − e.
 */
function maxCentralAngleDeg(radiusKm: number, minElDeg: number): number {
    const e = Math.min(minElDeg, 89.999) * DEG2RAD;
    const arg = (EARTH_RADIUS_KM / radiusKm) * Math.cos(e);
    if (arg >= 1) return 180; // degenerate small radius: treat as always-in-cone
    return Math.max(0, (Math.acos(Math.min(1, arg)) - e) * RAD2DEG);
}

/**
 * Upper bound (seconds) on the duration of one above-threshold pass: the
 * sub-point traverses at most 2ψ of the horizon cone, at a relative angular
 * rate no smaller than orbital rate + Earth rotation. Sized at the satellite's
 * apogee radius (largest ψ) as a conservative bound.
 */
function maxAboveThresholdSec(rec: SatRec, minElDeg: number): number {
    const n = meanMotionRadPerSec(rec);
    if (!(n > 0)) return 0;
    const rMax = semiMajorAxisKm(rec) * (1 + Math.min(rec.ecco, 0.99));
    const psiDeg = maxCentralAngleDeg(rMax, minElDeg);
    if (!(psiDeg > 0)) return 0;
    return (2 * psiDeg * DEG2RAD) / (n + OMEGA_EARTH);
}

const epochMsOf = (rec: SatRec): number => (rec.jdsatepoch - JULIAN_UNIX_EPOCH) * 86400000;

interface ResolvedParams {
    minElDeg: number;
    maxPasses: number;
    latRad: number;
    lonRad: number;
    startMs: number;
    endMs: number;
}

function resolveParams(params: PassSearchParams): ResolvedParams {
    return {
        minElDeg: params.minElDeg ?? 10,
        maxPasses: Math.max(1, params.maxPasses ?? 20),
        latRad: params.observer.latDeg * DEG2RAD,
        lonRad: params.observer.lonDeg * DEG2RAD,
        startMs: params.startMs,
        endMs: params.endMs
    };
}

/**
 * Stage-1 static screen: is this satellite's orbit plane ever close enough
 * for a pass? The satellite always lies on its orbit's great circle, whose
 * minimum angular distance to the observer equals the observer's angular
 * distance to the (J2-precessing) plane. If that distance exceeds the largest
 * horizon-cone angle over the whole window (with a safety pad), the satellite
 * can never pass and is skipped without a single SGP4 call.
 */
function planeScreensOut(rec: SatRec, resolved: ResolvedParams): boolean {
    const n = meanMotionRadPerSec(rec);
    if (!(n > 0)) return true;
    const psiDeg = maxCentralAngleDeg(
        semiMajorAxisKm(rec) * (1 + Math.min(rec.ecco, 0.99)),
        resolved.minElDeg
    );
    if (!(psiDeg > 0)) return true;
    const a = semiMajorAxisKm(rec);
    const { raanDot } = secularRates(a, rec.ecco, rec.inclo * RAD2DEG, n);
    const e0 = epochMsOf(rec);
    const cosLat = Math.cos(resolved.latRad);
    const sinLat = Math.sin(resolved.latRad);
    const sinI = Math.sin(rec.inclo);
    const cosI = Math.cos(rec.inclo);
    const span = Math.max(0, resolved.endMs - resolved.startMs);
    // Sample the precessing plane through the window; 0.5-day spacing covers
    // the fastest RAAN drift (~10°/day) far inside the 1° pad.
    const samples = 15;
    for (let k = 0; k < samples; k++) {
        const tMs = resolved.startMs + (k / (samples - 1)) * span;
        const raan = rec.nodeo + raanDot * ((tMs - e0) / 1000);
        // Orbit-plane normal in ECI.
        const nx = sinI * Math.sin(raan);
        const ny = -sinI * Math.cos(raan);
        const nz = cosI;
        const lon = resolved.lonRad + gstime(new Date(tMs));
        const ox = cosLat * Math.cos(lon);
        const oy = cosLat * Math.sin(lon);
        const oz = sinLat;
        const distDeg = Math.asin(Math.min(1, Math.abs(nx * ox + ny * oy + nz * oz))) * RAD2DEG;
        if (distDeg - 1 < psiDeg) return false; // reachable — keep the satellite
    }
    return true;
}

/**
 * Locate the threshold crossing between two samples of opposite sign.
 * Returns [lastBelow, firstAbove]. Works for rise (below → above) and set
 * (above → below) alike: bisection keeps the bracket straddling the crossing.
 */
function bisectCrossing(
    rec: SatRec,
    aT: number,
    bT: number,
    observerGd: ObserverGd,
    gate: PassVisibilityGate | undefined,
    minElDeg: number
): [number, number] {
    let lo = aT;
    let hi = bT;
    if (!(hi > lo)) return [lo, hi];
    const loAbove = effectiveElevationDeg(rec, lo, observerGd, gate) >= minElDeg;
    const hiAbove = effectiveElevationDeg(rec, hi, observerGd, gate) >= minElDeg;
    if (loAbove === hiAbove) return [lo, hi]; // caller error guard: no crossing
    for (let i = 0; i < BISECT_MAX_ITERS && hi - lo > BISECT_TOL_MS; i++) {
        const mid = (lo + hi) / 2;
        const midAbove = effectiveElevationDeg(rec, mid, observerGd, gate) >= minElDeg;
        if (midAbove === loAbove) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    // The bracket near the crossing: (lo, hi) with `lo` on one side, `hi` on
    // the other — return in [below, above] time order.
    return loAbove ? [hi, lo] : [lo, hi];
}

/** Golden-section maximum of the true elevation on [riseT, setT]: [tMax, deg]. */
function maxElevation(
    rec: SatRec,
    riseT: number,
    setT: number,
    observerGd: ObserverGd
): [number, number] {
    let a = riseT;
    let b = setT;
    let c = b - INV_PHI * (b - a);
    let d = a + INV_PHI * (b - a);
    let fc = effectiveElevationDeg(rec, c, observerGd, undefined);
    let fd = effectiveElevationDeg(rec, d, observerGd, undefined);
    for (let i = 0; i < MAX_EL_MAX_ITERS && b - a > 100; i++) {
        if (fc >= fd) {
            b = d;
            d = c;
            fd = fc;
            c = b - INV_PHI * (b - a);
            fc = effectiveElevationDeg(rec, c, observerGd, undefined);
        } else {
            a = c;
            c = d;
            fc = fd;
            d = a + INV_PHI * (b - a);
            fd = effectiveElevationDeg(rec, d, observerGd, undefined);
        }
    }
    const tMid = (a + b) / 2;
    const la = lookAnglesAt(rec, tMid, observerGd, undefined);
    return [tMid, la ? la.look.elevation * RAD2DEG : -90];
}

/**
 * Refine one coarse window [lo, hi] (both ends sampled below-threshold, or
 * window edges for clipped runs): re-sample the interior, split it into
 * contiguous above-threshold stretches and bisect each stretch's rise/set to
 * exact times. A window shorter than one full pass cycle can only contain a
 * single stretch — the first qualifying stretch is returned.
 */
function refineRun(
    rec: SatRec,
    name: string,
    index: number,
    lo: number,
    hi: number,
    resolved: ResolvedParams,
    observerGd: ObserverGd,
    gate: PassVisibilityGate | undefined
): PassRow | null {
    const maxDurMs = maxAboveThresholdSec(rec, resolved.minElDeg) * 1000;
    const stepRun = Math.min(MAX_STEP_MS, Math.max(1000, maxDurMs / 8));
    const times: number[] = [];
    const aboves: boolean[] = [];
    for (let t = lo; t < hi - stepRun / 2; t += stepRun) {
        times.push(t);
        aboves.push(effectiveElevationDeg(rec, t, observerGd, gate) >= resolved.minElDeg);
    }
    times.push(hi);
    aboves.push(effectiveElevationDeg(rec, hi, observerGd, gate) >= resolved.minElDeg);

    let i = 0;
    while (i < times.length) {
        if (!aboves[i]) {
            i++;
            continue;
        }
        let j = i;
        while (j + 1 < times.length && aboves[j + 1]) j++;
        // The stretch starts above first at times[i] and ends above last at
        // times[j]; neighbours (window edges excepted) sample below.
        const clippedRise = i === 0;
        const clippedSet = j === times.length - 1;

        let startMs = lo;
        if (!clippedRise) {
            // Rise: [lastBelow, firstAbove] between the neighbour below-sample and here.
            startMs = bisectCrossing(
                rec,
                times[i - 1],
                times[i],
                observerGd,
                gate,
                resolved.minElDeg
            )[1];
        }
        let endMs = hi;
        if (!clippedSet) {
            endMs = bisectCrossing(
                rec,
                times[j],
                times[j + 1],
                observerGd,
                gate,
                resolved.minElDeg
            )[0];
        }
        i = j + 1;

        if (!(endMs > startMs + 5)) continue; // threshold graze between samples — drop
        const [maxElAtMs, maxElDeg] = maxElevation(rec, startMs, endMs, observerGd);
        if (!(maxElDeg >= resolved.minElDeg)) continue;
        const startLook = lookDegAt(rec, startMs, observerGd);
        const endLook = lookDegAt(rec, endMs, observerGd);
        const row: PassRow = {
            index,
            name,
            startMs: Math.round(startMs),
            endMs: Math.round(endMs),
            maxElAtMs: Math.round(maxElAtMs),
            maxElDeg,
            startAzDeg: startLook.az,
            startElDeg: startLook.el,
            endAzDeg: endLook.az
        };
        if (
            [
                row.startMs,
                row.endMs,
                row.maxElAtMs,
                row.maxElDeg,
                row.startElDeg,
                row.startAzDeg,
                row.endAzDeg
            ].some((v) => !Number.isFinite(v))
        ) {
            continue;
        }
        return row;
    }
    return null;
}

/** Minimal binary min-heap over (key, value) pairs with numeric keys. */
class MinHeap {
    private keys: number[] = [];
    private vals: number[] = [];

    get size(): number {
        return this.keys.length;
    }

    get minKey(): number | null {
        return this.keys.length > 0 ? this.keys[0] : null;
    }

    push(key: number, val: number): void {
        this.keys.push(key);
        this.vals.push(val);
        let i = this.keys.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.keys[p] <= this.keys[i]) break;
            [this.keys[p], this.keys[i]] = [this.keys[i], this.keys[p]];
            [this.vals[p], this.vals[i]] = [this.vals[i], this.vals[p]];
            i = p;
        }
    }

    pop(): [number, number] | null {
        const last = this.keys.length - 1;
        if (last < 0) return null;
        const out: [number, number] = [this.keys[0], this.vals[0]];
        this.keys[0] = this.keys[last];
        this.vals[0] = this.vals[last];
        this.keys.pop();
        this.vals.pop();
        let i = 0;
        for (;;) {
            const l = 2 * i + 1;
            const r = l + 1;
            let m = i;
            if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l;
            if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r;
            if (m === i) break;
            [this.keys[m], this.keys[i]] = [this.keys[i], this.keys[m]];
            [this.vals[m], this.vals[i]] = [this.vals[i], this.vals[m]];
            i = m;
        }
        return out;
    }
}

/** Per-satellite search state (parallel array over survivors of the screen). */
interface CandidateSearchState {
    candidate: PassCandidate;
    /** Time of the next coarse sample (ms). */
    nextT: number;
    /** Time of the most recent coarse sample (ms). */
    prevT: number;
    /** Coarse cadence, bounded by the max above-threshold pass duration. */
    stepMs: number;
    /** Window start of the open above-threshold run, or null when closed. */
    openRunLo: number | null;
}

/**
 * Search for up to `maxPasses` passes over the observer. Yields progress
 * heartbeats (coarse samples processed) so a Web Worker driver can keep its
 * event loop responsive; the generator's return value is the final result.
 */
export function* findPasses(
    params: PassSearchParams
): Generator<PassSearchProgress, PassSearchResult, void> {
    const resolved = resolveParams(params);
    const observerGd: ObserverGd = {
        latitude: resolved.latRad,
        longitude: resolved.lonRad,
        height: 0
    };
    const minEl = resolved.minElDeg;
    const gate = params.gate;
    const budgetDeadline =
        params.wallBudgetMs !== undefined ? performance.now() + params.wallBudgetMs : null;
    // Top-N by start time, kept sorted ascending.
    const top: PassRow[] = [];
    let processed = 0;
    let partial = false;

    const insert = (row: PassRow): void => {
        const last = top.length - 1;
        if (top.length >= resolved.maxPasses && row.startMs >= top[last].startMs) return;
        let lo = 0;
        let hi = top.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (row.startMs < top[mid].startMs) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        top.splice(lo, 0, row);
        if (top.length > resolved.maxPasses) top.pop();
    };

    // Stage 1: static screen + per-satellite search state.
    const states: CandidateSearchState[] = [];
    for (const candidate of params.candidates) {
        if (planeScreensOut(candidate.rec, resolved)) continue;
        const maxDurSec = maxAboveThresholdSec(candidate.rec, minEl);
        if (!(maxDurSec > 0)) continue;
        states.push({
            candidate,
            nextT: resolved.startMs,
            prevT: resolved.startMs,
            stepMs: Math.min(MAX_STEP_MS, Math.max(1, Math.ceil((maxDurSec / 3) * 1000))),
            openRunLo: null
        });
    }

    // Stage 2+3: chronological coarse scan; refine runs as they close.
    const heap = new MinHeap();
    for (let i = 0; i < states.length; i++) heap.push(states[i].nextT, i);
    let samplesSinceYield = 0;
    // mayStopEarly is an O(states) scan — only worth running right after a new
    // pass makes the top list full (or a later pass reshuffles it).
    let exitCheckDue = false;

    // All future discoveries start after the earliest pending sample time or
    // open-run start, so once the top list is full and those are past the
    // Nth pass's start, nothing can beat the current result.
    const mayStopEarly = (): boolean => {
        if (top.length < resolved.maxPasses) return false;
        const boundary = top[top.length - 1].startMs;
        const heapKey = heap.minKey;
        if (heapKey !== null && heapKey <= boundary) return false;
        return states.every((s) => s.openRunLo === null || s.openRunLo >= boundary);
    };

    while (heap.size > 0) {
        if (exitCheckDue) {
            exitCheckDue = false;
            if (mayStopEarly()) break;
        }
        if (
            processed >= MAX_COARSE_SAMPLES ||
            (budgetDeadline !== null && performance.now() >= budgetDeadline)
        ) {
            partial = true;
            break;
        }
        const popped = heap.pop();
        if (!popped) break;
        const [t, si] = popped;
        const s = states[si];
        const la = lookAnglesAt(s.candidate.rec, t, observerGd, gate);
        processed++;
        samplesSinceYield++;
        const above = !!la && la.visible && la.look.elevation * RAD2DEG >= minEl;

        if (above) {
            if (s.openRunLo === null) s.openRunLo = s.prevT;
        } else if (s.openRunLo !== null) {
            const row = refineRun(
                s.candidate.rec,
                s.candidate.name,
                s.candidate.index,
                s.openRunLo,
                t,
                resolved,
                observerGd,
                gate
            );
            s.openRunLo = null;
            if (row) {
                insert(row);
                if (top.length >= resolved.maxPasses) exitCheckDue = true;
            }
        }
        s.prevT = t;
        s.nextT = t + s.stepMs;
        if (s.nextT < resolved.endMs) heap.push(s.nextT, si);
        // Re-arm the (rare) exit scan once the popped frontier is past the
        // full list's boundary — by then the heap min has proven the stopper.
        if (top.length >= resolved.maxPasses && t > top[top.length - 1].startMs) {
            exitCheckDue = true;
        }

        if (samplesSinceYield >= YIELD_EVERY) {
            samplesSinceYield = 0;
            yield { processed };
        }
    }

    // Runs still open at the window end: keep the clipped tail of the pass.
    for (const s of states) {
        if (s.openRunLo === null) continue;
        const row = refineRun(
            s.candidate.rec,
            s.candidate.name,
            s.candidate.index,
            s.openRunLo,
            resolved.endMs,
            resolved,
            observerGd,
            gate
        );
        s.openRunLo = null;
        if (row) insert(row);
    }

    return { passes: top, partial };
}
