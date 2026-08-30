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
    pointsPerOrbit: number;
    frame: Frame;
};

type WorkerMessage = InitMessage | PropagateMessage | BuildOrbitsMessage;

interface PreparedSatellite {
    rec: SatRec;
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
    const { requestId, epoch, pointsPerOrbit, frame } = message;
    const total = satellites.length;
    const maxSegments = total * pointsPerOrbit;
    const positions = new Float32Array(maxSegments * 2 * 3);
    let vertexCount = 0;
    const ranges: number[] = [];
    const CHUNK = 100;
    const epochMs = epoch;

    // For ECI orbits: compute in ECI, then rotate all points by a single
    // -GMST(epoch) to align with ECF satellite dots without runtime rotation.
    const cosR = frame === 'eci' ? Math.cos(-gstime(new Date(epochMs))) : 0;
    const sinR = frame === 'eci' ? Math.sin(-gstime(new Date(epochMs))) : 0;

    for (let i = 0; i < total; i++) {
        const rec = satellites[i].rec;
        const periodMs = ((2 * Math.PI) / rec.no) * 60000;
        let previous: [number, number, number] | null = null;
        const rangeStart = vertexCount;

        // ECI: sample one full period including endpoint (closes the ellipse).
        // ECF: sample one period excluding endpoint (open ground-track arc).
        const samples = frame === 'ecf' ? pointsPerOrbit : pointsPerOrbit + 1;
        for (let k = 0; k < samples; k++) {
            const t = epochMs + (k / pointsPerOrbit) * periodMs;
            const date = new Date(t);
            const state = propagate(rec, date);
            if (state.position === false || state.position === undefined) {
                previous = null;
                continue;
            }
            let point: [number, number, number];
            if (frame === 'ecf') {
                const ecf = eciToEcf(state.position as EciVec3<number>, gstime(date));
                point = [ecf.x * scale, ecf.y * scale, ecf.z * scale];
            } else {
                const eci = state.position as EciVec3<number>;
                const x = eci.x * scale;
                const y = eci.y * scale;
                point = [x * cosR - y * sinR, x * sinR + y * cosR, eci.z * scale];
            }
            if (previous) {
                positions[vertexCount++] = previous[0];
                positions[vertexCount++] = previous[1];
                positions[vertexCount++] = previous[2];
                positions[vertexCount++] = point[0];
                positions[vertexCount++] = point[1];
                positions[vertexCount++] = point[2];
            }
            previous = point;
        }

        ranges.push(rangeStart, vertexCount);

        if ((i + 1) % CHUNK === 0) {
            if (buildId !== orbitBuildId) return;
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    if (buildId !== orbitBuildId) return;
    const trimmed = vertexCount < positions.length ? positions.slice(0, vertexCount) : positions;
    postMessage({ type: 'orbits', requestId, vertexCount, positions: trimmed, ranges }, [
        trimmed.buffer
    ]);
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
