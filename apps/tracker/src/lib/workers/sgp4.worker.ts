import { twoline2satrec, propagate, eciToEcf, gstime } from 'satellite.js';
import type { EciVec3, SatRec } from 'satellite.js';
import type { ParsedSatellite } from '$lib/satellites/types';
import { elementsFor, type ElementMode, type OrbitalElements } from '$lib/orbit';
import { isSunlit, sunEciDirection } from '$lib/sun';
import { buildOrbitChain } from '$lib/orbitTrack';
import { sgp4Position } from '$lib/sgp4pos';

const EARTH_RADIUS_KM = 6371;
const MU_KM3_S2 = 398600.4418;
const RAD2DEG = 180 / Math.PI;
const JULIAN_UNIX_EPOCH = 2440587.5;

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
    /**
     * When set, bake ONLY this satellite's chain (a focus-only bake for
     * big catalogs whose orbits are off) — every other entry reports a
     * zero chain so per-sat metadata stays index-aligned.
     */
    onlyIndex: number | null;
};
type ModeMessage = { type: 'mode'; mode: ElementMode };
type BuildGroundTrackMessage = {
    type: 'buildGroundTrack';
    epoch: number;
    requestId: number;
    index: number;
};

type WorkerMessage =
    InitMessage | PropagateMessage | BuildOrbitsMessage | BuildGroundTrackMessage | ModeMessage;

interface PreparedSatellite {
    rec: SatRec;
    epochEl: OrbitalElements;
    nRadPerSec: number;
    epochMs: number;
}

const TAU = Math.PI * 2;
// Per-sat adaptive sampling; uniform-in-nu clusters near perigee.

// sgp4Position is shared via $lib/sgp4pos (same builder the scene uses).

// The 7 plotted quantities now come from `$lib/orbit`'s `elementsFor` — the

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
// Per-sat base class colors (LEO/MEO/GEO/ECC); the ready colors buffer is
// transferred away, so keep a copy to re-scale per propagate tick.
let baseColors = new Float32Array(0);
// Last announced sunlit status per satellite: colors ride the positions
// message only when an eclipse boundary is crossed, not every tick.
let lastSunlit: Uint8Array | null = null;
// Multiplicative dimming of eclipsed dots — darker but hue-preserving so the
// altitude color coding stays readable.
const ECLIPSE_DIM = 0.35;

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

// The 7 plotted quantities now come from `$lib/orbit`'s `elementsFor` — the
// finiteness screen there covers every element mode, so NaN rows never leave
// the worker.

async function buildOrbits(message: BuildOrbitsMessage): Promise<void> {
    const buildId = ++orbitBuildId;
    const bakeGeneration = catalogVersion;
    const { requestId, epoch, frame, onlyIndex } = message;
    // One flat vertex chain per satellite (two ν-continuous periods, refined
    // where chords get long) via the shared per-satellite chain builder in
    // $lib/orbitTrack — the same builder the scene uses for the highlight,
    // so the two implementations can't drift apart.
    const allVerts: number[] = [];
    const allTimes: number[] = [];
    const periods: number[] = [];
    const vertexCounts: number[] = [];
    const runs: number[] = [];
    const CHUNK = 20;
    const epochMs = epoch;
    // Snapshot up front: a re-init mid-build replaces `satellites`, so iterate
    // the snapshot and always push per-sat metadata to keep every array
    // index-aligned with the catalog the bake started from.
    const sats = satellites;
    const n = sats.length;

    for (let i = 0; i < n; i++) {
        const sat = sats[i];
        // Focus-only bake: every other entry reports a zero chain so per-sat
        // metadata stays index-aligned with the full catalog.
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
            continue; // catalog re-initialized mid-build (belt/braces)
        }
        const rec = sat.rec;
        let chain = null;
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
            // A re-initialization mid-build invalidates our satellite list —
            // bail instead of mixing chains from two catalogs.
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
            // Echo the bake epoch: views must slide against the epoch of the
            // bake they actually hold, not against a newer request's epoch.
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

/**
 * Nadir ground track for ONE satellite: 128 uniform-time steps per period over
 * TWO periods (the drawn window is one; between cadence rebuilds at high time
 * accelerations the window's start drifts into the second, so the extra
 * revolution is the sliding headroom). Each sample is projected through its
 * OWN timestamp's GMST onto the globe surface, so the result is always
 * earth-fixed regardless of the reference-frame toggle. Emitted as a vertex
 * chain with per-vertex time offsets (BakedChain shape) — SGP4 gaps are
 * concatenated, not segmented, so the chain may chord across short unknown
 * spans; the scene slides it with the same writer the orbit chains use.
 */
function buildGroundTrack(message: BuildGroundTrackMessage): void {
    const { requestId, epoch, index } = message;
    // Undrawable (bad index, hyperbolic elements, total SGP4 failure) still
    // answers with an empty track so the scene can back off instead of
    // re-requesting every cadence forever.
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
    // No closed period → no track (matches the orbit-drawing guard).
    if (!(ecc < 1) || !(meanMotionRadPerMs > 0)) {
        empty();
        return;
    }
    const periodMs = TAU / meanMotionRadPerMs;
    const surfaceRadius = scale * EARTH_RADIUS_KM;
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

function handleMessage(event: MessageEvent<WorkerMessage>): void {
    const message = event.data;
    switch (message.type) {
        case 'init': {
            satellites = [];
            scale = message.scale;
            elementMode = message.mode;
            for (const sat of message.satellites) {
                try {
                    const rec = twoline2satrec(sat.line1, sat.line2);
                    if (rec.error !== 0) continue;
                    const nRadPerSec = rec.no / 60;
                    if (!(nRadPerSec > 0)) continue;
                    const a = Math.cbrt(MU_KM3_S2 / (nRadPerSec * nRadPerSec));
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
                        // satellite.js stores the full Julian date in jdsatepoch.
                        epochMs: (rec.jdsatepoch - JULIAN_UNIX_EPOCH) * 86400000
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
            // NaN = "unknown" for a satellite whose propagation failed — views
            // skip NaN rows instead of plotting fake zeros at the origin.
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
                    // Unknown propagation → keep the previous eclipse status.
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
                // Elements screen their own finiteness, so `null` rows stay NaN.
                let el = null;
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
            // Only re-send the color buffer when some satellite crossed an
            // eclipse boundary — the query is cheap, the transfer is not.
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
        case 'buildGroundTrack': {
            if (!initialized) break;
            buildGroundTrack(message);
            break;
        }
    }
}

const workerScope = globalThis as unknown as Worker;
workerScope.onmessage = handleMessage;
