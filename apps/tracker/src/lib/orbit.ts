export interface OrbitalElements {
    a: number; // semi-major axis (km)
    e: number; // eccentricity
    i: number; // inclination (deg)
    raan: number; // right ascension of the ascending node (deg)
    argp: number; // argument of periapsis (deg)
    m: number; // mean anomaly (deg)
}

const EARTH_MU = 398600.4418; // km^3/s^2
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Classical (Keplerian) orbital elements from a TLE line 2.
 * Two-body only — no perturbations. Returns null if the line is unparsable.
 */
export function orbitalElements(line2: string): OrbitalElements | null {
    if (typeof line2 !== 'string' || line2.length < 63) return null;
    const i = parseFloat(line2.slice(8, 16));
    const raan = parseFloat(line2.slice(17, 25));
    const e = parseFloat(`0.${line2.slice(26, 33).trim()}`);
    const argp = parseFloat(line2.slice(34, 42));
    const m = parseFloat(line2.slice(43, 51));
    const n = parseFloat(line2.slice(52, 63)); // mean motion, revs/day
    if (![i, raan, e, argp, m, n].every(Number.isFinite) || n <= 0) return null;
    const nRadPerSec = (n * 2 * Math.PI) / 86400;
    const a = Math.cbrt(EARTH_MU / (nRadPerSec * nRadPerSec));
    return { a, e, i, raan, argp, m };
}

/**
 * Argument of latitude `u = ω + ν` — the angle from the ascending node to the
 * satellite (the "anomaly past the ascending node", as opposed to the mean anomaly
 * which is measured past periapsis). The true anomaly `ν` is obtained from the mean
 * anomaly via Kepler's equation. Returns degrees in [0, 360).
 */
export function argumentOfLatitude(el: OrbitalElements): number {
    const M = el.m * DEG2RAD;
    let E = M;
    for (let k = 0; k < 8; k++) {
        E -= (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
    }
    const nu =
        2 *
        Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2));
    const u = el.argp * DEG2RAD + nu;
    return (((u * RAD2DEG) % 360) + 360) % 360;
}
