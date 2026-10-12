import {
    eciToEcf,
    ecfToLookAngles,
    gstime,
    propagate,
    type EcfVec3,
    type EciVec3,
    type LookAngles,
    type SatRec
} from 'satellite.js';
import { EARTH_EQUATORIAL_RADIUS_KM, meanMotionRadPerSec, semiMajorAxisKm } from './astro';

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
 * Known tolerance: a tangential graze whose flanking coarse samples sit more
 * than GRAZE_MARGIN_DEG below the threshold would still slip between samples
 * — by continuity that requires an impossibly fast excursion for the orbital
 * classes with real passes, so graze scans close the practical hole (the
 * below→below gaps with elevated flanks plus each satellite's final tail gap
 * are re-scanned at ≤ 30 s cadence).
 */

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
// Earth's sidereal rotation rate (rad/s). Always added to the satellite's
// inertial rate when bounding how fast the observer-to-satellite geometry can
// change — correct for prograde, conservative for retrograde.
const OMEGA_EARTH = 7.2921159553e-5;

/** Higher-altitude bodies (GEO) coarse-step at most every hour. */
const MAX_STEP_MS = 3_600_000;
/** Single definition site for the search-candidate cap (worker + UI note surface). */
export const PASS_SEARCH_MAX_SATS = 2000;
/** Bisection convergence for rise/set times (milliseconds). */
const BISECT_TOL_MS = 20;
const BISECT_MAX_ITERS = 30;
/** Golden-section cap for the maximum-elevation search. */
const MAX_EL_MAX_ITERS = 60;
/** Heartbeat cadence: coarse samples evaluated per generator yield (macrotask slicing). */
const YIELD_EVERY = 400;
/**
 * Graze-scan margin (degrees below the threshold): gaps between two
 * below-threshold coarse samples are re-scanned finely only when both
 * flanking elevations are within this margin — the by-continuity signature of
 * a tangential graze that fits inside the step.
 */
const GRAZE_MARGIN_DEG = 5;
/**
 * Finalization-phase wall budget (ms): the stranded-tail loop (open runs +
 * capped graze strands) mirrors the search fuse so it can never freeze the
 * worker; if it trips, remaining finals are undisclosed → `partial`.
 */
const FINALIZE_BUDGET_MS = 500;

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

/** Max elevation search uses the golden-section conjugate. */
const INV_PHI = (Math.sqrt(5) - 1) / 2;

export interface PassSearchResult {
    /** Passes above the elevation threshold, sorted by start, at most `maxPasses`. */
    passes: PassRow[];
    /** True when the search stopped early (wall-clock budget) — results are incomplete. */
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
    const arg = (EARTH_EQUATORIAL_RADIUS_KM / radiusKm) * Math.cos(e);
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
 * Stage-1 static screen (exported): can this satellite's orbit plane ever
 * come close enough for a pass at the given observer latitude? The satellite
 * always lies on the orbit's great circle, so the best a satellite can ever
 * do equals the observer's angular distance to the orbit plane.
 *
 * That distance is `d(t) = |sinI·cosφ·sin(Ω−θ) + cosI·sinφ|` (φ = satellite.js
 * geodetic latitude, used as geocentric here — the ≤ 0.2° substitution error
 * is inside the 1° pad; θ = local sidereal longitude; Ω = ascending node
 * right ascension). The phase (Ω−θ) advances one full cycle per sidereal day,
 * so for any window of a day or more the minimum is exactly
 * `asin(max(0, |cosI·sinφ| − sinI·cosφ))`.
 *
 * Both directions are already safe, where barriers matter:
 * - Skip direction: the true window minimum can only be LARGER than the
 *   full-cycle envelope (the phase has not yet saturated on sub-day windows,
 *   and RAAN drift merely re-plays the same envelope with shifted phase), so
 *   skipping on the envelope never excludes a satellite that can pass.
 * - Keep direction: plane distance is a lower bound for orbit-point distance,
 *   so keep decisions never miss a pass either.
 * The 1° pad is therefore slack for the small φ-substitution and
 * radius-convention errors only.
 *
 * (This analytic bound replaced a fixed-interval phase sweep: sampling
 * (Ω−θ) at ~2 samples/day aliases against the once-daily cycle and can skip
 * every daily trough, which used to wrongly screen out whole orbital
 * classes — sun-sync (~98°) at mid-latitudes failed brute-force checks.)
 */
export function planeScreensOut(rec: SatRec, observerLatDeg: number, minElDeg = 10): boolean {
    const n = meanMotionRadPerSec(rec);
    if (!(n > 0)) return true;
    const psiDeg = maxCentralAngleDeg(
        semiMajorAxisKm(rec) * (1 + Math.min(rec.ecco, 0.99)),
        minElDeg
    );
    if (!(psiDeg > 0)) return true;
    const lat = Math.min(90, Math.max(-90, observerLatDeg)) * DEG2RAD;
    const sinI = Math.sin(rec.inclo);
    const cosI = Math.cos(rec.inclo);
    const reach = Math.abs(cosI * Math.sin(lat)) - sinI * Math.cos(lat);
    const distDeg = Math.asin(Math.min(1, Math.max(0, reach))) * RAD2DEG;
    // Never reachable: the observer's floor distance to the plane stays more
    // than a pad (≥ 1°) beyond the largest horizon-cone angle.
    return distDeg - 1 >= psiDeg;
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

/** Golden-section maximum of the true elevation on [a, b]: [tMax, deg]. */
function goldenMaxElevation(
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
 * Global-ish maximum of the true elevation on [riseT, setT]: golden-section
 * assumes a unimodal elevation curve, which holds over one pass but not over
 * a multi-day clipped run (e.g. a GEO belt satellite). Densify the span first
 * at ~maxDuration/8 spacing, take the best bracket, and golden-section that —
 * the dense grid bounds what a local max can miss.
 */
function maxElevation(
    rec: SatRec,
    riseT: number,
    setT: number,
    observerGd: ObserverGd,
    minElDeg: number
): [number, number] {
    const span = setT - riseT;
    const maxDurMs = maxAboveThresholdSec(rec, minElDeg) * 1000;
    if (!(span > 0)) return [riseT, -90];
    if (span > 6 * maxDurMs && maxDurMs > 0) {
        const step = Math.max(1000, maxDurMs / 8);
        let bestT = riseT;
        let bestDeg = -90;
        for (let t = riseT; t <= setT; t += step) {
            const deg = effectiveElevationDeg(rec, t, observerGd, undefined);
            if (deg > bestDeg) {
                bestDeg = deg;
                bestT = t;
            }
        }
        // The true max is trusted to lie within one max-duration bracket of
        // the dense-scan best (a pass above threshold lasts ≤ maxDur).
        return goldenMaxElevation(
            rec,
            Math.max(riseT, bestT - maxDurMs),
            Math.min(setT, bestT + maxDurMs),
            observerGd
        );
    }
    return goldenMaxElevation(rec, riseT, setT, observerGd);
}

/**
 * Refine one coarse window [lo, hi] (both ends sampled below-threshold, or
 * window edges for clipped runs): re-sample the interior, split it into
 * contiguous above-threshold stretches and bisect each stretch's rise/set to
 * exact times. Every qualifying stretch is returned — a budget-cut or
 * window-tail window can span many passes, and returning only the first one
 * would drop the rest. `innerStepMs` overrides the default re-sample cadence
 * (maxDuration/8) — used by the graze scans, which must resolve gaps between
 * coarse samples far finer than one pass duration.
 */
function refineRun(
    rec: SatRec,
    name: string,
    index: number,
    lo: number,
    hi: number,
    resolved: ResolvedParams,
    observerGd: ObserverGd,
    gate: PassVisibilityGate | undefined,
    innerStepMs?: number
): PassRow[] {
    const maxDurMs = maxAboveThresholdSec(rec, resolved.minElDeg) * 1000;
    const stepRun = Math.min(MAX_STEP_MS, Math.max(1000, innerStepMs ?? maxDurMs / 8));
    const times: number[] = [];
    const aboves: boolean[] = [];
    const rows: PassRow[] = [];
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

        // Threshold graze that ends between samples — drop.
        if (!(endMs > startMs + 5)) continue;
        const [maxElAtMs, maxElDeg] = maxElevation(
            rec,
            startMs,
            endMs,
            observerGd,
            resolved.minElDeg
        );
        if (maxElDeg >= resolved.minElDeg) {
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
            const finite = [
                row.startMs,
                row.endMs,
                row.maxElAtMs,
                row.maxElDeg,
                row.startElDeg,
                row.startAzDeg,
                row.endAzDeg
            ].every((v) => Number.isFinite(v));
            if (finite) rows.push(row);
        }
    }
    return rows;
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
    /** Effective elevation at `prevT` (degrees, −90 when gated/failed). */
    prevEffEl: number;
    /** Coarse cadence, bounded by the max above-threshold pass duration. */
    stepMs: number;
    /** Window start of the open above-threshold run, or null when closed. */
    openRunLo: number | null;
}

/**
 * Search for up to `maxPasses` passes over the observer. Periodically yields
 * nothing (`undefined`) purely so a Web Worker driver can slice the search
 * with macrotask yields and keep its event loop responsive; the generator's
 * return value is the final result. `wallBudgetMs` is the sole fuse guarding
 * pathological searches — past it the result reports `partial: true`.
 */
export function* findPasses(
    params: PassSearchParams
): Generator<undefined, PassSearchResult, void> {
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
        if (planeScreensOut(candidate.rec, params.observer.latDeg, minEl)) continue;
        const maxDurSec = maxAboveThresholdSec(candidate.rec, minEl);
        if (!(maxDurSec > 0)) continue;
        states.push({
            candidate,
            nextT: resolved.startMs,
            prevT: resolved.startMs,
            prevEffEl: -90,
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

    /**
     * Tangential grazes shorter than one coarse step can fit entirely inside
     * a below→below sample pair. Such a graze is by definition near-tangent,
     * so the elevation leaves the threshold ring slowly and the flanking
     * samples sit within a few degrees of it. Re-scanning only those gaps
     * (bounded extra evaluations, 2 per real pass worst case at LEO cadence)
     * closes the graze hole without a fixed ultra-fine sweep.
     */
    const grazeScan = (s: CandidateSearchState, hiMs: number): void => {
        const gap = hiMs - s.prevT;
        if (gap <= 0 || s.prevEffEl < minEl - GRAZE_MARGIN_DEG) return;
        const innerStep = Math.min(30000, Math.max(2000, gap / 16));
        samplesSinceYield += Math.ceil(gap / innerStep);
        const rows = refineRun(
            s.candidate.rec,
            s.candidate.name,
            s.candidate.index,
            s.prevT,
            hiMs,
            resolved,
            observerGd,
            gate,
            innerStep
        );
        for (const row of rows) {
            insert(row);
            if (top.length >= resolved.maxPasses) exitCheckDue = true;
        }
    };

    // All future discoveries start after the earliest pending sample time or
    // the last/first sample that could still bracket a pass, so once the top
    // list is full and those are past the Nth pass's start, nothing can beat
    // the current result.
    const mayStopEarly = (): boolean => {
        if (top.length < resolved.maxPasses) return false;
        const boundary = top[top.length - 1].startMs;
        const heapKey = heap.minKey;
        if (heapKey !== null && heapKey <= boundary) return false;
        // Closed state: any still-hiding pass rises AFTER its last sample
        // (`prevT`) — so `prevT >= boundary` closes the barrier. Open state:
        // its next pass could start anywhere past the run window; the window
        // opened on the previous (below-threshold) sample, so the run's
        // `openRunLo` is the earliest start it can contribute.
        return states.every((s) =>
            s.openRunLo === null ? s.prevT >= boundary : s.openRunLo >= boundary
        );
    };

    while (heap.size > 0) {
        if (exitCheckDue) {
            exitCheckDue = false;
            if (mayStopEarly()) break;
        }
        // The wall-clock budget is the single fuse; without it, only the
        // window, the heap, or an unbeatable top list ends the search.
        if (budgetDeadline !== null && performance.now() >= budgetDeadline) {
            partial = true;
            break;
        }
        const popped = heap.pop();
        if (!popped) break;
        const [t, si] = popped;
        const s = states[si];
        const la = lookAnglesAt(s.candidate.rec, t, observerGd, gate);
        samplesSinceYield++;
        const elDeg = la && la.visible ? la.look.elevation * RAD2DEG : -90;
        const above = elDeg >= minEl;

        // Closed-gap graze check comes first: a below→below step pair is the
        // only place a pass shorter than one step can hide.
        if (!above && s.openRunLo === null) grazeScan(s, t);

        if (above) {
            if (s.openRunLo === null) s.openRunLo = s.prevT;
        } else if (s.openRunLo !== null) {
            const rows = refineRun(
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
            for (const row of rows) {
                insert(row);
                if (top.length >= resolved.maxPasses) exitCheckDue = true;
            }
        }
        s.prevT = t;
        s.prevEffEl = elDeg;
        s.nextT = t + s.stepMs;
        if (s.nextT < resolved.endMs) heap.push(s.nextT, si);
        // Re-arm the (rare) exit scan once the popped frontier is past the
        // full list's boundary — by then the heap min has proven the stopper.
        if (top.length >= resolved.maxPasses && t > top[top.length - 1].startMs) {
            exitCheckDue = true;
        }

        if (samplesSinceYield >= YIELD_EVERY) {
            samplesSinceYield = 0;
            yield undefined;
        }
    }

    // Finalization: runs still open at the window end plus each closed
    // satellite's leftover tail gap. A tail deadline mirrors the search's own
    // fuse so a pathological strand can never block the worker past it; when
    // it trips we disclose incompleteness via `partial`.
    const tailDeadline = performance.now() + FINALIZE_BUDGET_MS;
    for (const s of states) {
        if (performance.now() >= tailDeadline) {
            partial = true;
            break;
        }
        if (s.openRunLo === null) {
            // Closed sat: graze-scan the tail gap after its last sample.
            // Cap the strand at the state's pending sample: everything from
            // there on either starts past the already-unbeatable top-N
            // boundary (early exit) or is disclosed by `partial` (budget
            // exit) / impossible (normal heap exhaustion ⇒ nextT ≥ endMs).
            // Without the cap a ~days-long strand executed tens of thousands
            // of SGP4 evaluations synchronously here, freezing propagation.
            grazeScan(s, Math.min(resolved.endMs, s.nextT));
            continue;
        }
        // Budget-cut or window-tail runs span an arbitrary number of passes;
        // refineRun samples at maxDuration/8, so even a multi-day open run
        // stays bounded and returns all of its passes.
        const rows = refineRun(
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
        for (const row of rows) insert(row);
    }

    return { passes: top, partial };
}
