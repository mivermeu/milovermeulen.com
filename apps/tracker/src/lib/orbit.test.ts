import { describe, it, expect } from 'bun:test';
import {
    eccentricAnomaly,
    trueAnomalyFromMean,
    meanAnomalyFromTrue,
    argumentOfLatitudeFromElements,
    meanAnomalyFromArgumentOfLatitude,
    elementsToPosition,
    orbitalPeriodSeconds,
    secularRates,
    propagateMeanElements,
    elementsFor
} from './orbit';

describe('two-body elements model', () => {
    it('solves Kepler for a circular orbit (E = M)', () => {
        expect(eccentricAnomaly(0, 0)).toBeCloseTo(0, 12);
        expect(eccentricAnomaly(Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2, 12);
    });

    it('maps mean anomaly to true anomaly and back', () => {
        for (const e of [0, 0.1, 0.5, 0.8]) {
            for (const m of [0, 30, 90, 180, 270, 359]) {
                const nu = trueAnomalyFromMean(m, e);
                expect(meanAnomalyFromTrue(nu, e)).toBeCloseTo(m, 5);
            }
        }
    });

    it('equals the mean anomaly when e = 0', () => {
        expect(trueAnomalyFromMean(123, 0)).toBeCloseTo(123, 6);
    });

    it('gives u = ω + M for a circular orbit', () => {
        const el = { a: 7000, e: 0, i: 0, raan: 0, argp: 40, m: 25 };
        expect(argumentOfLatitudeFromElements(el)).toBeCloseTo(65, 6);
    });

    it('inverts argument of latitude back to mean anomaly', () => {
        const el = { a: 7000, e: 0.3, i: 55, raan: 120, argp: 70, m: 0 };
        for (const u of [0, 45, 180, 300]) {
            const m = meanAnomalyFromArgumentOfLatitude(u, el);
            expect(argumentOfLatitudeFromElements({ ...el, m })).toBeCloseTo(u, 5);
        }
    });

    it('places a circular equatorial satellite at the expected point', () => {
        const [x, y, z] = elementsToPosition({ a: 7000, e: 0, i: 0, raan: 0, argp: 0, m: 90 });
        expect(x).toBeCloseTo(0, 6);
        expect(y).toBeCloseTo(7000, 6);
        expect(z).toBeCloseTo(0, 6);
    });

    it('gives perigee radius a(1 - e) at m = 0', () => {
        const el = { a: 8000, e: 0.25, i: 30, raan: 10, argp: 20, m: 0 };
        const [x, y, z] = elementsToPosition(el);
        expect(Math.hypot(x, y, z)).toBeCloseTo(8000 * (1 - 0.25), 6);
    });

    it('computes an ISS-like period (~93 min)', () => {
        expect(orbitalPeriodSeconds(6796) / 60).toBeGreaterThan(90);
        expect(orbitalPeriodSeconds(6796) / 60).toBeLessThan(95);
    });
});

describe('mean-element propagation', () => {
    const N = (15.49 * 2 * Math.PI) / 86400; // ISS-like mean motion, rad/s

    it('gives LEO J2 rates of the right sign and magnitude', () => {
        const { raanDot, argpDot } = secularRates(6796, 0.0005, 51.64, N);
        const raanDegPerDay = ((raanDot * 180) / Math.PI) * 86400;
        const argpDegPerDay = ((argpDot * 180) / Math.PI) * 86400;
        expect(raanDegPerDay).toBeLessThan(-3);
        expect(raanDegPerDay).toBeGreaterThan(-8);
        expect(argpDegPerDay).toBeGreaterThan(2);
        expect(argpDegPerDay).toBeLessThan(6);
    });

    it('advances M by a full revolution per period', () => {
        const el = { a: 6796, e: 0.0005, i: 51.64, raan: 100, argp: 50, m: 30 };
        const out = propagateMeanElements(el, N, (2 * Math.PI) / N);
        expect(out.m).toBeCloseTo(30, 3);
    });

    it('holds a, e, i and advances M a quarter turn in T/4', () => {
        const el = { a: 6796, e: 0.0005, i: 51.64, raan: 100, argp: 50, m: 0 };
        const out = propagateMeanElements(el, N, (2 * Math.PI) / N / 4);
        expect(out.a).toBe(el.a);
        expect(out.e).toBe(el.e);
        expect(out.i).toBe(el.i);
        expect(out.m).toBeCloseTo(90, 3);
    });
});

describe('plotted elements', () => {
    const N = (15.49 * 2 * Math.PI) / 86400;
    const EL = { a: 6796, e: 0.3, i: 51.64, raan: 100, argp: 50, m: 30 };
    // An exact equatorial state: r along +x, v along +y — the node is undefined.
    const EQ_R = { x: 7000, y: 0, z: 0 };
    const EQ_V = { x: 0, y: Math.sqrt(398600.4418 / 7000), z: 0 };
    // A valid inclined circular state: r at latitude 51.64° on the node plane,
    // v purely along +y (prograde, equator-ward through the descending node).
    const INCL_DEG = 51.64;
    const INCL_R = {
        x: 7000 * Math.cos((INCL_DEG * Math.PI) / 180),
        y: 0,
        z: 7000 * Math.sin((INCL_DEG * Math.PI) / 180)
    };
    const INCL_V = { x: 0, y: Math.sqrt(398600.4418 / 7000), z: 0 };

    it('freezes at the TLE epoch elements for epoch mode', () => {
        const el = elementsFor('epoch', EL, N, 1e6, INCL_R, INCL_V)!;
        expect(el.raan).toBe(EL.raan);
        expect(el.m).toBe(EL.m);
        expect(el.u).toBeCloseTo(argumentOfLatitudeFromElements(EL), 6);
    });

    it('advances the mean elements for smoothed mode', () => {
        const dt = (2 * Math.PI) / N / 4;
        const advanced = propagateMeanElements(EL, N, dt);
        const expected = { ...advanced, u: argumentOfLatitudeFromElements(advanced) };
        expect(elementsFor('smoothed', EL, N, dt, INCL_R, INCL_V)).toEqual(expected);
    });

    it('uses the live state elements in instantaneous mode', () => {
        const el = elementsFor('instantaneous', EL, N, 0, INCL_R, INCL_V)!;
        expect(el.a).toBeCloseTo(7000, 3);
        expect(el.i).toBeCloseTo(51.64, 3);
        // u is measured from the node; with r on the node plane it is ~90.
        expect(el.u).toBeCloseTo(90, 3);
        // Distinct from the mean-elements fallback (u = argp + ν there).
        expect(el.u).not.toBeCloseTo(argumentOfLatitudeFromElements(EL), 0);
    });

    it('falls back to mean elements when the instantaneous state has no node (equatorial)', () => {
        const el = elementsFor('instantaneous', EL, N, 0, EQ_R, EQ_V)!;
        expect(el).toEqual(elementsFor('smoothed', EL, N, 0, EQ_R, EQ_V)!);
        for (const v of [el.a, el.e, el.i, el.raan, el.argp, el.m, el.u]) {
            expect(Number.isFinite(v)).toBe(true);
        }
    });
});
