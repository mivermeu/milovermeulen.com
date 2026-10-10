import { twoline2satrec, propagate } from 'satellite.js';

export interface OrbitalElements {
    a: number; // semi-major axis (km)
    e: number; // eccentricity
    i: number; // inclination (deg)
    raan: number; // right ascension of the ascending node (deg)
    argp: number; // argument of periapsis (deg)
    m: number; // mean anomaly (deg)
}

const EARTH_MU = 398600.4418; // km^3/s^2
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
 * satellite (the "anomaly past the ascending node", vs the mean anomaly which is
 * measured past periapsis) — evaluated at a given time from the SGP4-propagated
 * position, so it matches the globe and advances with time. Degrees in [0, 360),
 * or null if the TLE is unparsable / propagation fails.
 */
export function argumentOfLatitudeAt(line1: string, line2: string, dateMs: number): number | null {
    let satrec;
    try {
        satrec = twoline2satrec(line1, line2);
    } catch {
        return null;
    }
    if (satrec.error !== 0) return null;
    const { position: r, velocity: v } = propagate(satrec, new Date(dateMs));
    if (typeof r === 'boolean' || typeof v === 'boolean' || !r || !v) return null;

    // Orbital-plane normal h = r × v.
    const hx = r.y * v.z - r.z * v.y;
    const hy = r.z * v.x - r.x * v.z;
    const hz = r.x * v.y - r.y * v.x;
    const hn = Math.hypot(hx, hy, hz);
    if (hn === 0) return null;
    // Ascending-node direction n = ẑ × h = (-hy, hx, 0).
    const nn = Math.hypot(hx, hy);
    if (nn === 0) return null;
    const nx = -hy / nn;
    const ny = hx / nn;
    // In-plane axis perpendicular to the node, along the motion: m = ĥ × n̂.
    const hhx = hx / hn;
    const hhy = hy / hn;
    const hhz = hz / hn;
    const mx = -hhz * ny;
    const my = hhz * nx;
    const mz = hhx * ny - hhy * nx;

    const u = Math.atan2(r.x * mx + r.y * my + r.z * mz, r.x * nx + r.y * ny);
    if (!Number.isFinite(u)) return null;
    return (((u * RAD2DEG) % 360) + 360) % 360;
}
