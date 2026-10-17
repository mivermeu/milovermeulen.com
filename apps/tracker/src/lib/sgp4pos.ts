import { propagate, type EciVec3, type SatRec } from 'satellite.js';

export type Sgp4Vec3 = [number, number, number];

/** SGP4 position in ECI km at a unix ms instant (null on error/non-finite). */
export function sgp4Position(rec: SatRec, tMs: number): Sgp4Vec3 | null {
    if (!Number.isFinite(tMs)) return null;
    let state;
    try {
        state = propagate(rec, new Date(tMs));
    } catch {
        return null;
    }
    if (!state || state.position === false || state.position === undefined) return null;
    const p = state.position as EciVec3<number>;
    if (!isFinite(p.x + p.y + p.z)) return null;
    return [p.x, p.y, p.z];
}
