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
const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;
const J2 = 1.08262668e-3;
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

export interface StateElements extends OrbitalElements {
    nu: number; // true anomaly (deg)
    u: number; // argument of latitude (deg)
}

/**
 * Osculating classical elements from an ECI position/velocity state (km, km/s).
 * Returns null for degenerate states. The periapsis-referenced angles (ω, ν, M)
 * are ill-conditioned for near-circular orbits; `u` comes from the node and stays
 * well-defined there.
 */
export function elementsFromState(r: EciVec3<number>, v: EciVec3<number>): StateElements | null {
    const rn = Math.hypot(r.x, r.y, r.z);
    const v2 = v.x * v.x + v.y * v.y + v.z * v.z;
    if (rn === 0 || v2 === 0) return null;

    const hx = r.y * v.z - r.z * v.y;
    const hy = r.z * v.x - r.x * v.z;
    const hz = r.x * v.y - r.y * v.x;
    const hn = Math.hypot(hx, hy, hz);
    if (hn === 0) return null;

    const rv = r.x * v.x + r.y * v.y + r.z * v.z;
    const k = v2 - EARTH_MU / rn;
    const ex = (k * r.x - rv * v.x) / EARTH_MU;
    const ey = (k * r.y - rv * v.y) / EARTH_MU;
    const ez = (k * r.z - rv * v.z) / EARTH_MU;
    const e = Math.hypot(ex, ey, ez);

    const a = 1 / (2 / rn - v2 / EARTH_MU);
    const i = Math.acos(Math.min(1, Math.max(-1, hz / hn))) * RAD2DEG;

    const hhx = hx / hn;
    const hhy = hy / hn;
    const hhz = hz / hn;

    // Ascending-node direction n = ẑ × h = (-hy, hx, 0).
    const nn = Math.hypot(hx, hy);
    const raan = nn > 0 ? Math.atan2(hx, -hy) * RAD2DEG : 0;

    let argp = 0;
    let nu = 0;
    if (e > 1e-10) {
        const exu = ex / e;
        const eyu = ey / e;
        const ezu = ez / e;
        const rx = r.x / rn;
        const ry = r.y / rn;
        const rz = r.z / rn;
        if (nn > 0) {
            const nxu = -hy / nn;
            const nyu = hx / nn;
            // ω = in-plane angle from n̂ to ê.
            const cx = nyu * ezu;
            const cy = -nxu * ezu;
            const cz = nxu * eyu - nyu * exu;
            argp = Math.atan2(hhx * cx + hhy * cy + hhz * cz, nxu * exu + nyu * eyu) * RAD2DEG;
        }
        // ν = in-plane angle from ê to r̂.
        const dx = eyu * rz - ezu * ry;
        const dy = ezu * rx - exu * rz;
        const dz = exu * ry - eyu * rx;
        nu = Math.atan2(hhx * dx + hhy * dy + hhz * dz, exu * rx + eyu * ry + ezu * rz) * RAD2DEG;
    }

    const wrap = (d: number): number => ((d % 360) + 360) % 360;
    const nuWrapped = wrap(nu);
    return {
        a,
        e,
        i,
        raan: wrap(raan),
        argp: wrap(argp),
        m: meanAnomalyFromTrue(nuWrapped, e),
        nu: nuWrapped,
        u: argumentOfLatitudeFromState(r, v)
    };
}

/**
 * First-order J2 secular rates (rad/s) for the ascending node and periapsis.
 * `nRadPerSec` is the mean motion.
 */
export function secularRates(
    aKm: number,
    e: number,
    iDeg: number,
    nRadPerSec: number
): { raanDot: number; argpDot: number } {
    const p = aKm * (1 - e * e);
    const factor = 1.5 * J2 * (EARTH_EQUATORIAL_RADIUS_KM / p) ** 2 * nRadPerSec;
    const ci = Math.cos(iDeg * DEG2RAD);
    return {
        raanDot: -factor * ci,
        argpDot: 0.5 * factor * (5 * ci * ci - 1)
    };
}

/**
 * Propagate a TLE's mean elements to `dtSeconds` after its epoch, using the
 * first-order J2 secular rates for the node and periapsis and `n` for the mean
 * anomaly. `a`, `e`, `i` are held (they barely change).
 */
export function propagateMeanElements(
    el: OrbitalElements,
    nRadPerSec: number,
    dtSeconds: number
): OrbitalElements {
    const { raanDot, argpDot } = secularRates(el.a, el.e, el.i, nRadPerSec);
    const wrap = (d: number): number => ((d % 360) + 360) % 360;
    return {
        a: el.a,
        e: el.e,
        i: el.i,
        raan: wrap(el.raan + raanDot * RAD2DEG * dtSeconds),
        argp: wrap(el.argp + argpDot * RAD2DEG * dtSeconds),
        m: wrap(el.m + nRadPerSec * RAD2DEG * dtSeconds)
    };
}
