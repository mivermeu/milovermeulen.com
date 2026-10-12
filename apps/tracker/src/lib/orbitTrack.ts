/**
 * Baked orbit chains — the single data shape every orbit-line consumer shares.
 *
 * A chain is one satellite's trajectory sampled over TWO ν-continuous periods
 * (the visible window is one period starting at the live dot; between cadence
 * rebuilds at high time accelerations the window's start drifts into the
 * second period, so the extra revolution is the sliding headroom). The chain
 * runs ν-continuously across the seam — it contains no fabricated long chords.
 *
 * Used by the SGP4 worker (building every satellite's chain per bake, in
 * formatting for the shared merged buffer) and by the scene (the focused
 * satellite's highlight is built synchronously ON THE MAIN THREAD when the
 * focus changes, so hovering is instant and can never wedge: the highlight
 * path contains no async request to lose or have superseded).
 */

import { eciToEcf, gstime, type EciVec3, type SatRec } from 'satellite.js';
import { sgp4Position, type Sgp4Vec3 } from './sgp4pos';

export type Vec3 = Sgp4Vec3;

const TAU = Math.PI * 2;

// ν-node density of a chain's per-period grid: e-cubed scaling on the base
// density fixes chord quality on eccentric orbits.
const BASE_POINTS = 64;
const ECC_CUBIC_POINTS = 640;
const MAX_GRID_POINTS = 600;
// Long chords are split at SGP4 mid-times until a sweep splits nothing; the
// budget bounds a satellite's refined vertex count.
const MAX_SUBDIVIDE_SWEEPS = 20;
const MAX_CHORD_ECF = 0.4; // world units
const MAX_CHORD_ECI = 1.0; // world units

export interface OrbitChain {
    /** Flat 3-float vertices (world units), run-concatenated. */
    positions: Float32Array;
    /** Monotone non-decreasing time offsets (ms) from `anchorEpoch`, per vertex. */
    times: Float32Array;
    vertexCount: number;
    anchorEpoch: number;
    /** Orbital period (ms). */
    periodMs: number;
    /**
     * GMST (rad) at `anchorEpoch` — the ECI bake's rotation basis (the
     * consuming mesh applies bakeGmst − renderGmst per frame in ECI mode).
     */
    bakeGmst: number;
    /** Chain vertex counts per contiguous run (length = run count). */
    runLens: number[];
    /** The reference frame the chain was projected for. */
    referenceFrame: ChainFrame;
}

/**
 * Reference-frame semantics of a chain's projection:
 * - 'ecf': each vertex is the satellite's position rotated into the
 *   earth-fixed frame by its OWN timestamp's GMST (never runtime-rotated).
 * - 'eci': all vertices are rotated by a single −GMST(anchorEpoch) after
 *   being computed in inertial space; the consuming mesh applies the
 *   build-vs-render GMST delta per frame (so the orbit stays inertial while
 *   the earth rotates beneath it).
 */
export type ChainFrame = 'ecf' | 'eci';

// sgp4Position lives in $lib/sgp4pos, shared with the SGP4 worker so the two
// implementations can't drift apart. NOTE: this module's Vec3 is a flat
// [x,y,z] tuple — intentionally NOT $lib/sun's {x,y,z} Vec3 object.

// Mean anomaly of an ECI position (NaN for e >= 1). J2-drifted elements add
// <1° error — fine for sample placement (only decides where points cluster,
// not their values).
function meanAnomaly(rec: SatRec, p: Vec3): number {
    const e = rec.ecco;
    if (!(e < 1)) return NaN;
    const cO = Math.cos(rec.nodeo);
    const sO = Math.sin(rec.nodeo);
    const ci = Math.cos(rec.inclo);
    const si = Math.sin(rec.inclo);
    const cw = Math.cos(rec.argpo);
    const sw = Math.sin(rec.argpo);
    const nu = Math.atan2(
        p[0] * (-cO * sw - sO * cw * ci) + p[1] * (-sO * sw + cO * cw * ci) + p[2] * (cw * si),
        p[0] * (cO * cw - sO * sw * ci) + p[1] * (sO * cw + cO * sw * ci) + p[2] * (sw * si)
    );
    const f = Math.sqrt((1 - e) / (1 + e));
    let E = 2 * Math.atan(f * Math.tan(nu / 2));
    if (nu < 0) E += TAU;
    return E - e * Math.sin(E);
}

/**
 * Build one satellite's orbit chain anchored at `anchorEpochMs`.
 *
 * Returns null when the satellite cannot be drawn at all: hyperbolic/parabolic
 * elements (translunar-coast TLEs, no closed period) or every node failing
 * SGP4 (decayed/invalid entries).
 *
 * `maxPoints` is a per-run budget bounding one contiguous run's refined
 * vertex count (checked per chord-split sweep output, not per satellite).
 */
export function buildOrbitChain(options: {
    rec: SatRec;
    anchorEpochMs: number;
    referenceFrame: ChainFrame;
    /** world distance units per km for the scene scale */
    worldPerKm: number;
    maxPoints?: number;
}): OrbitChain | null {
    const { rec, anchorEpochMs, referenceFrame, worldPerKm, maxPoints = 16384 } = options;
    const epochMs = anchorEpochMs;
    const inertial = referenceFrame === 'eci';
    const chordLimit2 = (inertial ? MAX_CHORD_ECI : MAX_CHORD_ECF) ** 2;

    // For ECI chains: compute in ECI and rotate every vertex by one single
    // −GMST(anchorEpoch) so the chain spans the same frame its consumers see.
    const bakeGmst = gstime(new Date(epochMs));
    const cosR = inertial ? Math.cos(-bakeGmst) : 0;
    const sinR = inertial ? Math.sin(-bakeGmst) : 0;

    const project = (p: Vec3, t: number): Vec3 => {
        if (!inertial) {
            const ecf = eciToEcf(
                { x: p[0], y: p[1], z: p[2] } as EciVec3<number>,
                gstime(new Date(t))
            );
            return [ecf.x * worldPerKm, ecf.y * worldPerKm, ecf.z * worldPerKm];
        }
        const x = p[0] * worldPerKm;
        const y = p[1] * worldPerKm;
        return [x * cosR - y * sinR, x * sinR + y * cosR, p[2] * worldPerKm];
    };

    // Live phase: solve the current mean anomaly from SGP4 at the anchor; the
    // TLE's stored mo is stale (days old) and would rotate the whole grid's
    // density pattern away from the true perigee on eccentric orbits.
    const nowPos = sgp4Position(rec, epochMs);
    const ecc = rec.ecco;
    if (!(ecc < 1)) return null; // hyperbolic/parabolic: no closed orbit
    const meanMotionRadPerMs = rec.no / 60000;
    if (!(meanMotionRadPerMs > 0)) return null;
    const periodMs = TAU / meanMotionRadPerMs;
    const count = Math.min(MAX_GRID_POINTS, BASE_POINTS + Math.round(ECC_CUBIC_POINTS * ecc ** 3));
    const eFactor = Math.sqrt((1 - ecc) / (1 + ecc));
    const m0 = nowPos ? meanAnomaly(rec, nowPos) : rec.mo;

    // Uniform-in-nu grid over one period, rotated so node 0 is exactly the
    // satellite's position at the anchor (arcs must start at the sat).
    const dts: number[] = new Array(count);
    for (let k = 0; k < count; k++) {
        const nu = (k / count) * TAU;
        const eAnom = 2 * Math.atan(eFactor * Math.tan(nu / 2)) + (k * 2 > count ? TAU : 0);
        const m = eAnom - ecc * Math.sin(eAnom);
        dts[k] = ((((m - m0) % TAU) + TAU) % TAU) / meanMotionRadPerMs;
    }
    let kMin = 0;
    for (let k = 1; k < count; k++) if (dts[k] < dts[kMin]) kMin = k;
    dts[kMin] = 0;

    // Doubled chain: two periods of ν nodes.
    const chainCount = 2 * count;
    let tArr: number[] = new Array(chainCount);
    let eArr: Array<Vec3 | null> = new Array(chainCount);
    for (let s = 0; s < chainCount; s++) {
        const k = (kMin + s) % count;
        tArr[s] = epochMs + dts[k] + Math.floor(s / count) * periodMs;
        eArr[s] = s === 0 ? nowPos : sgp4Position(rec, tArr[s]);
    }
    // Re-anchor on the first good node (inertial: rotate the node list there
    // then make times strictly ascending) or trim unknowns (ECF: keep the
    // good span). Runs of SGP4 failures stay open (honest gaps) — no chord
    // is ever drawn across an unknown span.
    {
        let first = -1;
        let last = -1;
        for (let s = 0; s < chainCount; s++) {
            if (eArr[s]) {
                if (first < 0) first = s;
                last = s;
            }
        }
        if (first < 0) return null;
        if (inertial) {
            if (first > 0) {
                tArr = tArr.slice(first).concat(tArr.slice(0, first));
                eArr = eArr.slice(first).concat(eArr.slice(0, first));
            }
            // Rotating the node list can wrap times (tail nodes belong to the
            // earlier period copy). Add whole periods until ascending again —
            // the sliding writer requires monotone non-decreasing offsets.
            for (let s = 1; s < tArr.length; s++) {
                while (tArr[s] < tArr[s - 1]) tArr[s] += periodMs;
            }
        } else {
            // ECF keeps the good span; leading/trailing unknowns are trimmed.
            tArr = tArr.slice(first, last + 1);
            eArr = eArr.slice(first, last + 1);
        }
    }

    // Emit per good run; split long chords at mid-times (SGP4 only — a failed
    // midpoint keeps the whole chord, never an invented point).
    const splitLongChord = (t: number[], p: Vec3[]): [number[], Vec3[]] => {
        let sweep = 0;
        let split = true;
        let T = t;
        let P = p;
        while (split && sweep < MAX_SUBDIVIDE_SWEEPS && T.length < maxPoints) {
            sweep++;
            split = false;
            const oT: number[] = [T[0]];
            const oP: Vec3[] = [P[0]];
            for (let j = 0; j + 1 < T.length; j++) {
                if (oP.length >= maxPoints - 1) {
                    // Budget hit: emit the rest verbatim (no more splitting)
                    // so the run tail is preserved, then stop.
                    for (let r = j + 1; r < T.length && oT.length < maxPoints; r++) {
                        oT.push(T[r]);
                        oP.push(P[r]);
                    }
                    break;
                }
                const a = P[j];
                const b = P[j + 1];
                const dx = a[0] - b[0];
                const dy = a[1] - b[1];
                const dz = a[2] - b[2];
                const tm = (T[j] + T[j + 1]) / 2;
                if (dx * dx + dy * dy + dz * dz > chordLimit2) {
                    const se = sgp4Position(rec, tm);
                    if (se) {
                        oT.push(tm);
                        oP.push(project(se, tm));
                        split = true;
                    }
                }
                oT.push(T[j + 1]);
                oP.push(P[j + 1]);
            }
            T = oT;
            P = oP;
        }
        return [T, P];
    };

    const positions: number[] = [];
    const offsets: number[] = [];
    const runLens: number[] = [];
    let runStart = 0;
    while (runStart < eArr.length) {
        while (runStart < eArr.length && !eArr[runStart]) runStart++;
        if (runStart >= eArr.length) break;
        let runEnd = runStart;
        while (runEnd + 1 < eArr.length && eArr[runEnd + 1]) runEnd++;
        let rT = tArr.slice(runStart, runEnd + 1);
        let rP: Vec3[] = [];
        for (let s = runStart; s <= runEnd; s++) rP.push(project(eArr[s] as Vec3, tArr[s]));
        [rT, rP] = splitLongChord(rT, rP);
        for (const p of rP) positions.push(p[0], p[1], p[2]);
        for (const t of rT) offsets.push(t - epochMs);
        runLens.push(rP.length);
        runStart = runEnd + 1;
    }
    if (runLens.length === 0) return null;

    return {
        positions: new Float32Array(positions),
        times: new Float32Array(offsets),
        vertexCount: runLens.reduce((a, b) => a + b, 0),
        anchorEpoch: epochMs,
        periodMs,
        bakeGmst,
        referenceFrame,
        runLens
    };
}
