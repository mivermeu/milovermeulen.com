import type { SatRec } from 'satellite.js';

/**
 * Shared astronomical constants and helpers for the SGP4 worker and the pass
 * finder. satellite.js stores `rec.no` in rad/MINUTE and the full Julian date
 * in `jdsatepoch` — these helpers normalize that so both consumers agree.
 */

/** WGS-84 Earth gravitational parameter (km³/s²). */
export const MU_KM3_S2 = 398600.4418;
/** Earth equatorial radius (km) — the radius horizon/elevation geometry uses. */
export const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;
/** Earth mean radius (km) — used for rough altitude classes (dot colors etc.). */
export const EARTH_MEAN_RADIUS_KM = 6371;
/** Julian date of the Unix epoch. */
export const JULIAN_UNIX_EPOCH = 2440587.5;

/** satellite.js stores rec.no in rad/MINUTE; convert helpers. */
export const meanMotionRadPerSec = (rec: SatRec): number => rec.no / 60;

/** Semi-major axis (km) implied by the TLE's mean motion. */
export function semiMajorAxisKm(rec: SatRec): number {
    const n = meanMotionRadPerSec(rec);
    return Math.cbrt(MU_KM3_S2 / (n * n));
}

/** TLE epoch in Unix milliseconds (rec.jdsatepoch is a full Julian date). */
export function tleEpochMs(rec: SatRec): number {
    return (rec.jdsatepoch - JULIAN_UNIX_EPOCH) * 86400000;
}
