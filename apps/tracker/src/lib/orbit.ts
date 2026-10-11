import { twoline2satrec, propagate } from 'satellite.js';
import type { EciVec3 } from 'satellite.js';

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
const DEG2RAD = Math.PI / 180;

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
 * Argument of latitude `u` (the angle from the ascending node to the satellite —
 * the "anomaly past the ascending node") from an ECI position/velocity pair.
 * Degrees in [0, 360), or NaN if the state is degenerate.
 */
export function argumentOfLatitudeFromState(r: EciVec3<number>, v: EciVec3<number>): number {
    // Orbital-plane normal h = r × v.
    const hx = r.y * v.z - r.z * v.y;
    const hy = r.z * v.x - r.x * v.z;
    const hz = r.x * v.y - r.y * v.x;
    const hn = Math.hypot(hx, hy, hz);
    // Ascending-node direction n = ẑ × h = (-hy, hx, 0).
    const nn = Math.hypot(hx, hy);
    if (hn === 0 || nn === 0) return NaN;
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
    if (!Number.isFinite(u)) return NaN;
    return (((u * RAD2DEG) % 360) + 360) % 360;
}

/**
 * Argument of latitude at a given time, from the SGP4-propagated position.
 * Returns degrees in [0, 360), or null if the TLE is unparsable / propagation fails.
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
    const u = argumentOfLatitudeFromState(r as EciVec3<number>, v as EciVec3<number>);
    return Number.isFinite(u) ? u : null;
}

/**
 * Solve Kepler's equation `M = E - e·sin E` for the eccentric anomaly `E`
 * (radians) by Newton–Raphson. `M` is the mean anomaly in radians.
 */
export function eccentricAnomaly(mRad: number, e: number): number {
    let E = mRad;
    for (let k = 0; k < 16; k++) {
        const step = (E - e * Math.sin(E) - mRad) / (1 - e * Math.cos(E));
        E -= step;
        if (Math.abs(step) < 1e-12) break;
    }
    return E;
}

/** True anomaly (deg, [0, 360)) from mean anomaly (deg) and eccentricity. */
export function trueAnomalyFromMean(mDeg: number, e: number): number {
    const E = eccentricAnomaly(mDeg * DEG2RAD, e);
    const nu =
        2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    return (((nu * RAD2DEG) % 360) + 360) % 360;
}

/** Mean anomaly (deg, [0, 360)) from true anomaly (deg) and eccentricity. */
export function meanAnomalyFromTrue(nuDeg: number, e: number): number {
    const nu = nuDeg * DEG2RAD;
    const E =
        2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    return ((((E - e * Math.sin(E)) * RAD2DEG) % 360) + 360) % 360;
}

/** Argument of latitude `u = ω + ν` (deg, [0, 360)) for a set of elements. */
export function argumentOfLatitudeFromElements(el: OrbitalElements): number {
    return (((el.argp + trueAnomalyFromMean(el.m, el.e)) % 360) + 360) % 360;
}

/**
 * Mean anomaly (deg) that puts the satellite at argument of latitude `uDeg`,
 * keeping the other elements fixed — the inverse of `argumentOfLatitudeFromElements`.
 */
export function meanAnomalyFromArgumentOfLatitude(uDeg: number, el: OrbitalElements): number {
    return meanAnomalyFromTrue((((uDeg - el.argp) % 360) + 360) % 360, el.e);
}

/**
 * ECI position (km) for the given classical elements — an idealized two-body
 * orbit (no perturbations), for drawing an explanatory orbit.
 */
export function elementsToPosition(el: OrbitalElements): [number, number, number] {
    const E = eccentricAnomaly(el.m * DEG2RAD, el.e);
    const r = el.a * (1 - el.e * Math.cos(E));
    const nu =
        2 *
        Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2));
    const xp = r * Math.cos(nu);
    const yp = r * Math.sin(nu);
    const w = el.argp * DEG2RAD;
    const O = el.raan * DEG2RAD;
    const inc = el.i * DEG2RAD;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const cO = Math.cos(O);
    const sO = Math.sin(O);
    const ci = Math.cos(inc);
    const si = Math.sin(inc);
    return [
        (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp,
        (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp,
        sw * si * xp + cw * si * yp
    ];
}

/** Two-body orbital period (seconds) for a semi-major axis in km. */
export function orbitalPeriodSeconds(aKm: number): number {
    return 2 * Math.PI * Math.sqrt(aKm ** 3 / EARTH_MU);
}
