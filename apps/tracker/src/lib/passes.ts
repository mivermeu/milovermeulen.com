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
import {
    EARTH_EQUATORIAL_RADIUS_KM,
    EARTH_MEAN_RADIUS_KM,
    meanMotionRadPerSec,
    semiMajorAxisKm
} from './astro';

/** Location-centric pass finding: plane screen → per-satellite coarse stepping → bisection/golden-section refine, merged chronologically to top-N. */
const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
// Sidereal rate added to the inertial rate when bounding geometry change.
const OMEGA_EARTH = 7.2921159553e-5;

/** Higher-altitude bodies (GEO) coarse-step at most every hour. */
const MAX_STEP_MS = 3_600_000;
/** Horizon threshold shared by the pass search and the footprint ring. */
export const PASS_MIN_EL_DEG = 10;
/** Single definition site for the search-candidate cap (worker + UI note surface). */
export const PASS_SEARCH_MAX_SATS = 2000;
/** Perigee cap: only satellites with perigee ≤ this (km) are searched ( eccentric low-arc orbits still qualify). */
export const PASS_MAX_PERIGEE_KM = 2000;
/** Bisection convergence for rise/set times (milliseconds). */
const BISECT_TOL_MS = 20;
const BISECT_MAX_ITERS = 30;
/** Golden-section cap for the maximum-elevation search. */
const MAX_EL_MAX_ITERS = 60;
/** Coarse samples evaluated per generator yield (macrotask slicing). */
const YIELD_EVERY = 400;
/** Below→below gaps re-scan finely only when both flanks sit within this margin of the threshold. */
const GRAZE_MARGIN_DEG = 5;
/** Finalization-phase wall budget (ms); tripping it reports `partial`. */
const FINALIZE_BUDGET_MS = 500;

export interface ObserverLocation {
    /** Geodetic latitude, degrees north. */
    latDeg: number;
    /** Geodetic longitude, degrees east. */
    lonDeg: number;
}

/** Visibility gate hook (sunlight feature): false counts the sample as below-horizon. */
export type PassVisibilityGate = (visibility: {
    /** Absolute sample time (ms). */
    tMs: number;
    /** Satellite ECF position (km). */
    ecf: EcfVec3<number>;
    /** Look angles from the observer (radians). */
    look: LookAngles;
}) => boolean;

/** One satellite the search evaluates. */
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
    /** Optional wall-clock budget (ms); past it the search reports `partial: true`. */
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

/** Preselect satellites: keep propagable records, lowest orbit first, capped. */
export function capCandidates(
    candidates: PassCandidate[],
    maxSats: number
): { capped: PassCandidate[]; active: number; searched: number } {
    const usable = candidates.filter((c) => c.rec.no > 0);
    const sorted = [...usable].sort((a, b) => b.rec.no - a.rec.no || a.index - b.index);
    const capped = sorted.slice(0, Math.max(0, maxSats));
    return { capped, active: candidates.length, searched: capped.length };
}

interface ObserverGd {
    latitude: number;
    longitude: number;
    height: number;
}

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

/** Effective elevation (degrees); −90 when SGP4 fails or the gate rejects it. */
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

function lookDegAt(rec: SatRec, tMs: number, observerGd: ObserverGd): { az: number; el: number } {
    const la = lookAnglesAt(rec, tMs, observerGd, undefined);
    if (!la) return { az: NaN, el: NaN };
    const az = (((la.look.azimuth * RAD2DEG) % 360) + 360) % 360;
    return { az, el: la.look.elevation * RAD2DEG };
}

/** Largest geocentric angle ψ (deg) at which radius `radiusKm` reaches `minElDeg`. From tan e = (r·cos ψ − R)/(r·sin ψ): ψ = arccos((R/r)·cos e) − e. */
export function maxCentralAngleDeg(radiusKm: number, minElDeg: number): number {
    const e = Math.min(minElDeg, 89.999) * DEG2RAD;
    const arg = (EARTH_EQUATORIAL_RADIUS_KM / radiusKm) * Math.cos(e);
    if (arg >= 1) return 180;
    return Math.max(0, (Math.acos(Math.min(1, arg)) - e) * RAD2DEG);
}

/** Upper bound (s) on one above-threshold pass. Sized at perigee radius/rate so fast perigee arcs can't hide between samples. */
function maxAboveThresholdSec(rec: SatRec, minElDeg: number): number {
    const n = meanMotionRadPerSec(rec);
    if (!(n > 0)) return 0;
    const e = Math.min(rec.ecco, 0.99);
    const rMin = semiMajorAxisKm(rec) * (1 - e);
    const psiDeg = maxCentralAngleDeg(rMin, minElDeg);
    if (!(psiDeg > 0)) return 0;
    const eRate = Math.min(rec.ecco, 0.9);
    const ratePeri = (n * Math.sqrt(1 + eRate)) / (1 - eRate) ** 1.5;
    return (2 * psiDeg * DEG2RAD) / (ratePeri + OMEGA_EARTH);
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

/** True when perigee sits above PASS_MAX_PERIGEE_KM (beyond visible range). */
export function exceedsPassAltitude(rec: SatRec): boolean {
    const perigeeKm = semiMajorAxisKm(rec) * (1 - Math.min(rec.ecco, 0.99)) - EARTH_MEAN_RADIUS_KM;
    return !(perigeeKm <= PASS_MAX_PERIGEE_KM);
}

/** Stage-1 plane screen: observer-to-plane floor distance `asin(max(0, |cosI·sinφ| − sinI·cosφ))` must reach the horizon cone (1° pad covers φ/radius error). */
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
    return distDeg - 1 >= psiDeg;
}

/** Threshold crossing between opposite-sign samples; returns [lastBelow, firstAbove]. */
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
    if (loAbove === hiAbove) return [lo, hi];
    for (let i = 0; i < BISECT_MAX_ITERS && hi - lo > BISECT_TOL_MS; i++) {
        const mid = (lo + hi) / 2;
        const midAbove = effectiveElevationDeg(rec, mid, observerGd, gate) >= minElDeg;
        if (midAbove === loAbove) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
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

/** Global-ish elevation max on [riseT, setT]: densify multi-day spans, then golden-section the best bracket. */
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
        // The true max lies within one max-duration bracket of the dense-scan best.
        return goldenMaxElevation(
            rec,
            Math.max(riseT, bestT - maxDurMs),
            Math.min(setT, bestT + maxDurMs),
            observerGd
        );
    }
    return goldenMaxElevation(rec, riseT, setT, observerGd);
}

/** Split a coarse window into above-threshold stretches; bisect each rise/set to exact times. */
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
        const clippedRise = i === 0;
        const clippedSet = j === times.length - 1;

        let startMs = lo;
        if (!clippedRise) {
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
    nextT: number;
    prevT: number;
    /** Effective elevation at `prevT` (degrees, −90 when gated/failed). */
    prevEffEl: number;
    /** Coarse cadence, bounded by the max above-threshold pass duration. */
    stepMs: number;
    /** Window start of the open above-threshold run, or null when closed. */
    openRunLo: number | null;
}

/** Search up to `maxPasses` passes; yields `undefined` so a worker can slice with macrotask yields. */
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
        if (exceedsPassAltitude(candidate.rec)) continue;
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

    const heap = new MinHeap();
    for (let i = 0; i < states.length; i++) heap.push(states[i].nextT, i);
    let samplesSinceYield = 0;
    let exitCheckDue = false;
    let exitedEarly = false;

    /** Re-scan below→below gaps with elevated flanks: a sub-step graze hides only there. */
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

    // Stop once the full top list can no longer be beaten by a later discovery.
    const mayStopEarly = (): boolean => {
        if (top.length < resolved.maxPasses) return false;
        const boundary = top[top.length - 1].startMs;
        const heapKey = heap.minKey;
        if (heapKey !== null && heapKey <= boundary) return false;
        // Closed: hiding passes rise after `prevT`; open: earliest start is `openRunLo`.
        return states.every((s) =>
            s.openRunLo === null ? s.prevT >= boundary : s.openRunLo >= boundary
        );
    };

    while (heap.size > 0) {
        if (exitCheckDue) {
            exitCheckDue = false;
            if (mayStopEarly()) {
                exitedEarly = true;
                break;
            }
        }
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
        if (top.length >= resolved.maxPasses && t > top[top.length - 1].startMs) {
            exitCheckDue = true;
        }

        if (samplesSinceYield >= YIELD_EVERY) {
            samplesSinceYield = 0;
            yield undefined;
        }
    }

    // Finalization: open runs plus each closed satellite's tail gap (skipped after early exit; tail fuse guards the worker).
    const tailDeadline = performance.now() + FINALIZE_BUDGET_MS;
    if (!exitedEarly) {
        for (const s of states) {
            if (performance.now() >= tailDeadline) {
                partial = true;
                break;
            }
            if (s.openRunLo === null) {
                // Cap the strand at the pending sample: uncapped, a days-long strand runs tens of thousands of SGP4 evals synchronously.
                grazeScan(s, Math.min(resolved.endMs, s.nextT));
                continue;
            }
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
    }

    return { passes: top, partial };
}
