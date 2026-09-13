import { twoline2satrec, propagate, eciToEcf, gstime } from 'satellite.js';
import type { EciVec3, SatRec } from 'satellite.js';
import type { ParsedSatellite } from '$lib/satellites/types';

const EARTH_RADIUS_KM = 6371;
const MU_KM3_S2 = 398600.4418;

type Frame = 'ecf' | 'eci';
type InitMessage = { type: 'init'; satellites: ParsedSatellite[]; scale: number };
type PropagateMessage = { type: 'propagate'; epoch: number; requestId: number };
type BuildOrbitsMessage = {
    type: 'buildOrbits';
    epoch: number;
    requestId: number;
    frame: Frame;
};

type WorkerMessage = InitMessage | PropagateMessage | BuildOrbitsMessage;

interface PreparedSatellite {
    rec: SatRec;
}

const TAU = Math.PI * 2;
// Per-sat adaptive sampling; uniform-in-nu clusters near perigee.
const BASE_POINTS = 64;
const ECC_CUBIC_POINTS = 640;
const MAX_GRID_POINTS = 600;
const MAX_PTS_PER_SAT = 16384;
const MAX_SUBDIVIDE_SWEEPS = 20;
const MAX_CHORD_ECI = 1.0;
const MAX_CHORD_ECF = 0.4;

type Vec3 = [number, number, number];

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

const LEO_COLOR = [0.50588, 0.54902, 0.97255]; // #818cf8
const MEO_COLOR = [1.0, 0.41176, 0.0]; // #ff6900
const GEO_COLOR = [0.95686, 0.24706, 0.36863]; // #f43f5e
const ECC_COLOR = [0.58039, 0.63922, 0.72157]; // #94a3b8

let satellites: PreparedSatellite[] = [];
let scale = 1;
let initialized = false;
let orbitBuildId = 0;

function altitudeKm(rec: SatRec): number {
    const meanMotionRadPerSec = rec.no / 60;
    const semiMajorAxis = Math.cbrt(MU_KM3_S2 / (meanMotionRadPerSec * meanMotionRadPerSec));
    return semiMajorAxis - EARTH_RADIUS_KM;
}

function colorFor(rec: SatRec): number[] {
    if (rec.ecco > 0.5) return ECC_COLOR;
    const altitude = altitudeKm(rec);
    if (altitude < 2000) return LEO_COLOR;
    if (altitude < 35000) return MEO_COLOR;
    return GEO_COLOR;
}

async function buildOrbits(message: BuildOrbitsMessage): Promise<void> {
    const buildId = ++orbitBuildId;
    const { requestId, epoch, frame } = message;
    const total = satellites.length;
    const inertial = frame === 'eci';
    const chordLimit2 = (inertial ? MAX_CHORD_ECI : MAX_CHORD_ECF) ** 2;
    const out: number[] = [];
    const ranges: number[] = [];
    const CHUNK = 100;
    const epochMs = epoch;

    // For ECI orbits: compute in ECI, then rotate all points by a single
    // -GMST(epoch) to align with ECF satellite dots without runtime rotation.
    const cosR = inertial ? Math.cos(-gstime(new Date(epochMs))) : 0;
    const sinR = inertial ? Math.sin(-gstime(new Date(epochMs))) : 0;

    const project = (p: Vec3, t: number): Vec3 => {
        if (frame === 'ecf') {
            const ecf = eciToEcf(
                { x: p[0], y: p[1], z: p[2] } as EciVec3<number>,
                gstime(new Date(t))
            );
            return [ecf.x * scale, ecf.y * scale, ecf.z * scale];
        }
        const x = p[0] * scale;
        const y = p[1] * scale;
        return [x * cosR - y * sinR, x * sinR + y * cosR, p[2] * scale];
    };
    const sgp4At = (rec: SatRec, t: number): Vec3 | null => {
        const state = propagate(rec, new Date(t));
        if (state.position === false || state.position === undefined) return null;
        const p = state.position as EciVec3<number>;
        if (!isFinite(p.x + p.y + p.z)) return null;
        return [p.x, p.y, p.z];
    };
    // Split long chords at SGP4 mid-times until a full sweep splits nothing.
    const refine = (rec: SatRec, t: number[], p: Vec3[], maxPts: number): [number[], Vec3[]] => {
        let sweep = 0;
        let split = true;
        let T = t;
        let P = p;
        while (split && sweep < MAX_SUBDIVIDE_SWEEPS && T.length < maxPts) {
            sweep++;
            split = false;
            const oT: number[] = [T[0]];
            const oP: Vec3[] = [P[0]];
            for (let j = 0; j + 1 < T.length && oT.length < maxPts; j++) {
                const a = P[j];
                const b = P[j + 1];
                const dx = a[0] - b[0];
                const dy = a[1] - b[1];
                const dz = a[2] - b[2];
                const tm = (T[j] + T[j + 1]) / 2;
                if (dx * dx + dy * dy + dz * dz > chordLimit2) {
                    const se = sgp4At(rec, tm);
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

    for (let i = 0; i < total; i++) {
        const rec = satellites[i].rec;
        const rangeStart = out.length;
        const ecc = rec.ecco;
        // Hyperbolic/parabolic elements (e.g. translunar coast TLEs) have no
        // closed period to sample — skip orbit drawing rather than garbage.
        if (!(ecc < 1)) {
            ranges.push(rangeStart, rangeStart);
            continue;
        }
        const count = Math.min(
            MAX_GRID_POINTS,
            BASE_POINTS + Math.round(ECC_CUBIC_POINTS * ecc ** 3)
        );
        const meanMotionRadPerMs = rec.no / 60000;
        if (!(meanMotionRadPerMs > 0)) {
            ranges.push(rangeStart, rangeStart);
            continue;
        }
        const periodMs = TAU / meanMotionRadPerMs;
        const eFactor = Math.sqrt((1 - ecc) / (1 + ecc));
        // Live phase: solve the current mean anomaly from SGP4 at epoch.
        // rec.mo is stale (TLE epoch, days old) and would rotate the whole
        // density pattern away from the true perigee on eccentric orbits.
        const nowPos = sgp4At(rec, epochMs);
        const m0 = nowPos ? meanAnomaly(rec, nowPos) : rec.mo;
        // Uniform-in-nu grid over one period, rotated so node 0 is exactly
        // the satellite's current position (arcs must start at the sat).
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

        // Pass 1: SGP4 grid in ECI km (null where SGP4 errors).
        let tArr: number[] = new Array(count);
        let eArr: Array<Vec3 | null> = new Array(count);
        for (let s = 0; s < count; s++) {
            const t = epochMs + dts[(kMin + s) % count];
            tArr[s] = t;
            eArr[s] = s === 0 ? nowPos : sgp4At(rec, t);
        }
        // Re-anchor on the first good node (inertial) or trim unknowns
        // (ECF). Runs of SGP4 failures stay open (honest gaps) — loops are
        // never closed, so no chord is ever drawn across unknown spans.
        {
            let first = -1;
            let last = -1;
            for (let s = 0; s < count; s++) {
                if (eArr[s]) {
                    if (first < 0) first = s;
                    last = s;
                }
            }
            if (first < 0) {
                ranges.push(rangeStart, rangeStart);
                continue;
            }
            if (inertial) {
                if (first > 0) {
                    tArr = tArr.slice(first).concat(tArr.slice(0, first));
                    eArr = eArr.slice(first).concat(eArr.slice(0, first));
                }
                for (let s = 1; s < tArr.length; s++) {
                    if (tArr[s] < tArr[s - 1]) tArr[s] += periodMs;
                }
            } else {
                tArr = tArr.slice(first, last + 1);
                eArr = eArr.slice(first, last + 1);
            }
        }

        // Emit per good run; split long chords at mid-times (SGP4 only —
        // a failed midpoint keeps the whole chord, never an invented point).
        let totalPts = 0;
        let runStart = 0;
        while (runStart < eArr.length) {
            while (runStart < eArr.length && !eArr[runStart]) runStart++;
            if (runStart >= eArr.length) break;
            let runEnd = runStart;
            while (runEnd + 1 < eArr.length && eArr[runEnd + 1]) runEnd++;
            let rT = tArr.slice(runStart, runEnd + 1);
            let rP: Vec3[] = [];
            for (let s = runStart; s <= runEnd; s++) rP.push(project(eArr[s] as Vec3, tArr[s]));
            [rT, rP] = refine(rec, rT, rP, MAX_PTS_PER_SAT - totalPts);
            for (let j = 0; j + 1 < rP.length; j++) {
                const a = rP[j];
                const b = rP[j + 1];
                out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
            }
            totalPts += rT.length;
            runStart = runEnd + 1;
        }
        ranges.push(rangeStart, out.length);

        if ((i + 1) % CHUNK === 0) {
            if (buildId !== orbitBuildId) return;
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    if (buildId !== orbitBuildId) return;
    const positions = new Float32Array(out);
    postMessage({ type: 'orbits', requestId, positions, ranges }, [positions.buffer]);
}

function handleMessage(event: MessageEvent<WorkerMessage>): void {
    const message = event.data;
    switch (message.type) {
        case 'init': {
            satellites = [];
            scale = message.scale;
            for (const sat of message.satellites) {
                try {
                    const rec = twoline2satrec(sat.line1, sat.line2);
                    if (rec.error !== 0) continue;
                    satellites.push({ rec });
                } catch {
                    // skip malformed TLE entries
                }
            }
            const colors = new Float32Array(satellites.length * 3);
            satellites.forEach((sat, index) => {
                const color = colorFor(sat.rec);
                colors[index * 3] = color[0];
                colors[index * 3 + 1] = color[1];
                colors[index * 3 + 2] = color[2];
            });
            initialized = true;
            orbitBuildId++;
            postMessage({ type: 'ready', count: satellites.length, colors }, [colors.buffer]);
            break;
        }
        case 'propagate': {
            if (!initialized) break;
            const { epoch, requestId } = message;
            const date = new Date(epoch);
            const gmst = gstime(date);
            const positions = new Float32Array(satellites.length * 3);
            for (let i = 0; i < satellites.length; i++) {
                const state = propagate(satellites[i].rec, date);
                if (state.position === false || state.position === undefined) continue;
                const ecf = eciToEcf(state.position as EciVec3<number>, gmst);
                positions[i * 3] = ecf.x * scale;
                positions[i * 3 + 1] = ecf.y * scale;
                positions[i * 3 + 2] = ecf.z * scale;
            }
            postMessage(
                { type: 'positions', requestId, epoch, count: satellites.length, positions },
                [positions.buffer]
            );
            break;
        }
        case 'buildOrbits': {
            if (!initialized) break;
            void buildOrbits(message);
            break;
        }
    }
}

const workerScope = globalThis as unknown as Worker;
workerScope.onmessage = handleMessage;
