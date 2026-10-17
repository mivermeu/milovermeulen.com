import { twoline2satrec, propagate, eciToEcf, gstime } from 'satellite.js';
import type { EciVec3, SatRec } from 'satellite.js';
import type { ParsedSatellite } from '$lib/satellites/types';
import {
    elementsFor,
    type ElementMode,
    type OrbitalElements,
    type PlottedElements
} from '$lib/orbit';
import { EARTH_MEAN_RADIUS_KM, semiMajorAxisKm, tleEpochMs } from '$lib/astro';
import {
    capCandidates,
    exceedsPassAltitude,
    findPasses,
    planeScreensOut,
    PASS_SEARCH_MAX_SATS,
    type PassCandidate,
    type PassSearchResult,
    type PassVisibilityGate
} from '$lib/passes';
import { isSunlit, sunEciDirection } from '$lib/sun';
import { buildOrbitChain, type OrbitChain } from '$lib/orbitTrack';
import { sgp4Position } from '$lib/sgp4pos';

const RAD2DEG = 180 / Math.PI;

type Frame = 'ecf' | 'eci';
type InitMessage = {
    type: 'init';
    satellites: ParsedSatellite[];
    scale: number;
    mode: ElementMode;
};
type PropagateMessage = {
    type: 'propagate';
    epoch: number;
    requestId: number;
    /** Echoed on the positions response so views can detect regime changes. */
    revision?: number;
};
type BuildOrbitsMessage = {
    type: 'buildOrbits';
    epoch: number;
    requestId: number;
    frame: Frame;
    /** When set, bake only this satellite; others report zero chains so metadata stays index-aligned. */
    onlyIndex: number | null;
    /** Graph-selection cull flags per worker slot (1 = visible); culled sats bake zero chains. */
    cullMask?: Uint8Array | null;
};
type ModeMessage = { type: 'mode'; mode: ElementMode };
type PassesMessage = {
    type: 'passes';
    requestId: number;
    observer: { latDeg: number; lonDeg: number };
    startMs: number;
    endMs: number;
    minElDeg?: number;
    maxPasses?: number;
    maxSats?: number;
    /** Original-catalog index per satellite in last-`init` order (maps via `srcIndex`). */
    originalIndices: number[];
};
type BuildGroundTrackMessage = {
    type: 'buildGroundTrack';
    epoch: number;
    requestId: number;
    index: number;
};

type WorkerMessage =
    | InitMessage
    | PropagateMessage
    | BuildOrbitsMessage
    | BuildGroundTrackMessage
    | ModeMessage
    | PassesMessage;

interface PreparedSatellite {
    rec: SatRec;
    epochEl: OrbitalElements;
    nRadPerSec: number;
    epochMs: number;
    name: string;
    srcIndex: number;
}

const TAU = Math.PI * 2;

const LEO_COLOR = [0.50588, 0.54902, 0.97255]; // #818cf8
const MEO_COLOR = [1.0, 0.41176, 0.0]; // #ff6900
const GEO_COLOR = [0.95686, 0.24706, 0.36863]; // #f43f5e
const ECC_COLOR = [0.58039, 0.63922, 0.72157]; // #94a3b8

let satellites: PreparedSatellite[] = [];
let scale = 1;
let initialized = false;
let orbitBuildId = 0;
// Bumped on every init; stamped onto responses so views can drop stale snapshots.
let catalogVersion = 0;
let elementMode: ElementMode = 'smoothed';
// Base colors kept (the ready buffer is transferred away) to re-scale per tick.
let baseColors = new Float32Array(0);
// Last sunlit status per sat; colors ride positions only on eclipse-boundary crossings.
let lastSunlit: Uint8Array | null = null;
const ECLIPSE_DIM = 0.35;

// HOOK POINT (feat/sunlight-globe): assign a PassVisibilityGate here to restrict passes to optically visible ones.
const passVisibilityGate: PassVisibilityGate | undefined = undefined;

// Search slicing: each generator heartbeat (~400 coarse samples) yields so live ticks keep flowing.
const PASS_SEARCH_BUDGET_MS = 4000;

function altitudeKm(rec: SatRec): number {
    return semiMajorAxisKm(rec) - EARTH_MEAN_RADIUS_KM;
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
    const bakeGeneration = catalogVersion;
    const { requestId, epoch, frame, onlyIndex, cullMask } = message;
    // One flat chain per satellite via the shared builder ($lib/orbitTrack, also used by the scene highlight).
    const allVerts: number[] = [];
    const allTimes: number[] = [];
    const periods: number[] = [];
    const vertexCounts: number[] = [];
    const runs: number[] = [];
    const CHUNK = 20;
    const epochMs = epoch;
    // Snapshot up front: a mid-build re-init replaces `satellites`, so keep arrays index-aligned.
    const sats = satellites;
    const n = sats.length;

    for (let i = 0; i < n; i++) {
        const sat = sats[i];
        if (cullMask && i < cullMask.length && !cullMask[i]) {
            vertexCounts.push(0);
            periods.push(0);
            runs.push(0);
            continue;
        }
        if (onlyIndex !== null && onlyIndex !== undefined && i !== onlyIndex) {
            vertexCounts.push(0);
            periods.push(0);
            runs.push(0);
            continue;
        }
        if (!sat) {
            vertexCounts.push(0);
            periods.push(0);
            runs.push(0);
            continue;
        }
        const rec = sat.rec;
        let chain: OrbitChain | null;
        try {
            chain = buildOrbitChain({
                rec,
                anchorEpochMs: epochMs,
                referenceFrame: frame,
                worldPerKm: scale,
                maxPoints: 16384
            });
        } catch {
            chain = null;
        }
        if (chain) {
            for (const p of chain.positions) allVerts.push(p);
            for (const t of chain.times) allTimes.push(t);
            vertexCounts.push(chain.vertexCount);
            periods.push(chain.periodMs);
            runs.push(chain.runLens.length);
            for (const len of chain.runLens) runs.push(len);
        } else {
            vertexCounts.push(0);
            periods.push(0);
            runs.push(0);
        }
        if ((i + 1) % CHUNK === 0) {
            if (buildId !== orbitBuildId) return;
            if (bakeGeneration !== catalogVersion) return;
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    if (buildId !== orbitBuildId) return;
    if (bakeGeneration !== catalogVersion) return;
    const positions = new Float32Array(allVerts);
    const vertexTimes = new Float32Array(allTimes);
    postMessage(
        {
            type: 'orbits',
            requestId,
            // Views must slide against the held bake's epoch, not a newer request's.
            epoch,
            generation: bakeGeneration,
            positions,
            vertexTimes,
            periods,
            vertexCounts,
            runs: new Int32Array(runs)
        },
        [positions.buffer, vertexTimes.buffer]
    );
}

/** Nadir ground track for one satellite: 128 steps/period over two periods (one drawn + sliding headroom), always earth-fixed. */
function buildGroundTrack(message: BuildGroundTrackMessage): void {
    const { requestId, epoch, index } = message;
    // Undrawable tracks still answer empty so the scene backs off instead of re-requesting forever.
    const empty = () =>
        postMessage({
            type: 'groundTrack',
            requestId,
            generation: catalogVersion,
            epoch,
            periodMs: 0,
            positions: new Float32Array(0),
            vertexTimes: new Float32Array(0)
        });
    const sat = satellites[index];
    if (!sat) {
        empty();
        return;
    }
    const rec = sat.rec;
    const meanMotionRadPerMs = rec.no / 60000;
    const ecc = rec.ecco;
    if (!(ecc < 1) || !(meanMotionRadPerMs > 0)) {
        empty();
        return;
    }
    const periodMs = TAU / meanMotionRadPerMs;
    const surfaceRadius = scale * EARTH_MEAN_RADIUS_KM;
    const POINTS = 128;
    const positions: number[] = [];
    const times: number[] = [];
    for (let k = 0; k <= 2 * POINTS; k++) {
        const t = epoch + (k / POINTS) * periodMs;
        const p = sgp4Position(rec, t);
        if (!p) continue;
        const ecf = eciToEcf({ x: p[0], y: p[1], z: p[2] } as EciVec3<number>, gstime(new Date(t)));
        const r = Math.hypot(ecf.x, ecf.y, ecf.z) || 1;
        positions.push(
            (ecf.x / r) * surfaceRadius,
            (ecf.y / r) * surfaceRadius,
            (ecf.z / r) * surfaceRadius
        );
        times.push(t - epoch);
    }
    if (positions.length < 6) {
        empty();
        return;
    }
    const baked = new Float32Array(positions);
    const bakedTimes = new Float32Array(times);
    postMessage(
        {
            type: 'groundTrack',
            requestId,
            generation: catalogVersion,
            epoch,
            periodMs,
            positions: baked,
            vertexTimes: bakedTimes
        },
        [baked.buffer, bakedTimes.buffer]
    );
}

/** Drive the pass-search generator with macrotask yields; null when superseded (never posts stale results). */
async function drivePassSearch(
    iter: Generator<undefined, PassSearchResult, void>,
    generation: number,
    token: number
): Promise<PassSearchResult | null> {
    for (;;) {
        const step = iter.next();
        if (token !== passSearchToken || generation !== catalogVersion) {
            iter.return({ passes: [], partial: true });
            return null;
        }
        if (step.done) return step.value;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

/** Latest pass-search token — each new request retires the previous. */
let passSearchToken = 0;

async function runPassSearch(message: PassesMessage): Promise<void> {
    const requestId = message.requestId;
    const generation = catalogVersion;
    const token = ++passSearchToken;
    const minElDeg = message.minElDeg ?? 10;
    // Plane-cone screen costs no SGP4 calls — apply to the full pool before the count cap.
    const screened: PassCandidate[] = [];
    for (const sat of satellites) {
        if (exceedsPassAltitude(sat.rec)) continue;
        if (planeScreensOut(sat.rec, message.observer.latDeg, minElDeg)) continue;
        screened.push({
            name: sat.name,
            rec: sat.rec,
            index: message.originalIndices[sat.srcIndex] ?? sat.srcIndex
        });
    }
    const cap = capCandidates(screened, message.maxSats ?? PASS_SEARCH_MAX_SATS);
    const iter = findPasses({
        candidates: cap.capped,
        observer: message.observer,
        startMs: message.startMs,
        endMs: message.endMs,
        minElDeg: message.minElDeg,
        maxPasses: message.maxPasses,
        gate: passVisibilityGate,
        wallBudgetMs: PASS_SEARCH_BUDGET_MS
    });
    const result = await drivePassSearch(iter, generation, token);
    if (!result || token !== passSearchToken || generation !== catalogVersion) return;
    postMessage({
        type: 'passes',
        requestId,
        generation,
        passes: result.passes,
        partial: result.partial,
        capInfo: {
            active: cap.active,
            searched: cap.searched,
            capped: cap.active > cap.searched
        }
    });
}

function handleMessage(event: MessageEvent<WorkerMessage>): void {
    const message = event.data;
    switch (message.type) {
        case 'init': {
            satellites = [];
            scale = message.scale;
            elementMode = message.mode;
            for (let srcIndex = 0; srcIndex < message.satellites.length; srcIndex++) {
                const sat = message.satellites[srcIndex];
                try {
                    const rec = twoline2satrec(sat.line1, sat.line2);
                    if (rec.error !== 0) continue;
                    const nRadPerSec = rec.no / 60;
                    if (!(nRadPerSec > 0)) continue;
                    const a = semiMajorAxisKm(rec);
                    const epochEl: OrbitalElements = {
                        a,
                        e: rec.ecco,
                        i: rec.inclo * RAD2DEG,
                        raan: rec.nodeo * RAD2DEG,
                        argp: rec.argpo * RAD2DEG,
                        m: rec.mo * RAD2DEG
                    };
                    satellites.push({
                        rec,
                        epochEl,
                        nRadPerSec,
                        epochMs: tleEpochMs(rec),
                        name: sat.name,
                        srcIndex
                    });
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
            baseColors = Float32Array.from(colors);
            lastSunlit = null;
            initialized = true;
            orbitBuildId++;
            catalogVersion++;
            postMessage(
                { type: 'ready', count: satellites.length, colors, generation: catalogVersion },
                [colors.buffer]
            );
            break;
        }
        case 'propagate': {
            if (!initialized) break;
            const { epoch, requestId } = message;
            const date = new Date(epoch);
            const gmst = gstime(date);
            const count = satellites.length;
            const positions = new Float32Array(count * 3).fill(NaN);
            const elements = new Float32Array(count * 7).fill(NaN);
            const sunUnit = sunEciDirection(epoch);
            const sunlit = new Uint8Array(count);
            for (let i = 0; i < count; i++) {
                const sat = satellites[i];
                let state;
                try {
                    state = propagate(sat.rec, date);
                } catch {
                    sunlit[i] = lastSunlit ? (lastSunlit[i] ?? 1) : 1;
                    continue;
                }
                if (!state || state.position === false || state.position === undefined) {
                    sunlit[i] = lastSunlit ? (lastSunlit[i] ?? 1) : 1;
                    continue;
                }
                const eci = state.position as EciVec3<number>;
                if (!isFinite(eci.x + eci.y + eci.z)) {
                    sunlit[i] = lastSunlit ? (lastSunlit[i] ?? 1) : 1;
                    continue;
                }
                sunlit[i] = isSunlit(eci, sunUnit) ? 1 : 0;
                const ecf = eciToEcf(eci, gmst);
                positions[i * 3] = ecf.x * scale;
                positions[i * 3 + 1] = ecf.y * scale;
                positions[i * 3 + 2] = ecf.z * scale;
                let el: PlottedElements | null;
                try {
                    el = elementsFor(
                        elementMode,
                        sat.epochEl,
                        sat.nRadPerSec,
                        (epoch - sat.epochMs) / 1000,
                        eci,
                        state.velocity
                    );
                } catch {
                    el = null;
                }
                if (!el) continue;
                elements[i * 7] = el.a;
                elements[i * 7 + 1] = el.e;
                elements[i * 7 + 2] = el.i;
                elements[i * 7 + 3] = el.raan;
                elements[i * 7 + 4] = el.argp;
                elements[i * 7 + 5] = el.m;
                elements[i * 7 + 6] = el.u;
            }
            // Only re-send colors on an eclipse-boundary crossing; the query is cheap, the transfer is not.
            let eclipseChanged = !lastSunlit || lastSunlit.length !== count;
            if (!eclipseChanged) {
                for (let i = 0; i < count; i++) {
                    if (sunlit[i] !== lastSunlit![i]) {
                        eclipseChanged = true;
                        break;
                    }
                }
            }
            let colors: Float32Array<ArrayBuffer> | undefined;
            if (eclipseChanged) {
                colors = new Float32Array(baseColors.length);
                for (let i = 0; i < count; i++) {
                    const f = sunlit[i] ? 1 : ECLIPSE_DIM;
                    colors[i * 3] = baseColors[i * 3] * f;
                    colors[i * 3 + 1] = baseColors[i * 3 + 1] * f;
                    colors[i * 3 + 2] = baseColors[i * 3 + 2] * f;
                }
                lastSunlit = sunlit;
            }
            const transfer: ArrayBuffer[] = [positions.buffer, elements.buffer];
            if (colors) transfer.push(colors.buffer);
            postMessage(
                {
                    type: 'positions',
                    requestId,
                    epoch,
                    count,
                    generation: catalogVersion,
                    revision: message.revision,
                    positions,
                    elements,
                    colors
                },
                transfer
            );
            break;
        }
        case 'mode': {
            elementMode = message.mode;
            break;
        }
        case 'buildOrbits': {
            if (!initialized) break;
            void buildOrbits(message);
            break;
        }
        case 'passes': {
            if (!initialized) break;
            void runPassSearch(message);
            break;
        }
        case 'buildGroundTrack': {
            if (!initialized) break;
            buildGroundTrack(message);
            break;
        }
    }
}

const workerScope = globalThis as unknown as Worker;
workerScope.onmessage = handleMessage;
