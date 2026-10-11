import { describe, it, expect } from 'bun:test';
import {
    sunEciDirection,
    sunEcfDirection,
    subsolarPoint,
    sunDistanceKm,
    isSunlit,
    gmstRadians,
    daysSinceJ2000,
    EARTH_EQUATORIAL_RADIUS_KM,
    type Vec3
} from './sun';

const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

describe('sun ephemeris', () => {
    it('julian day conversions anchor correctly', () => {
        expect(daysSinceJ2000(Date.UTC(2000, 0, 1, 12))).toBeCloseTo(0, 6);
        expect(daysSinceJ2000(0)).toBeCloseTo(-10957.5, 3);
    });

    it('GMST matches the known J2000 value', () => {
        // GMST = 280.46061837° at the J2000 epoch.
        const gmstDeg = gmstRadians(Date.UTC(2000, 0, 1, 12)) * (180 / Math.PI);
        expect(gmstDeg).toBeCloseTo(280.46061837, 2);
    });

    it('sun vector is a unit vector', () => {
        for (const ms of [
            0,
            Date.UTC(2024, 5, 20),
            Date.UTC(2024, 11, 21, 9)
        ]) {
            const s = sunEciDirection(ms);
            expect(len(s)).toBeCloseTo(1, 12);
        }
    });

    it('subsolar latitude is ~0° at the equinoxes', () => {
        // 2024 equinox moments: Mar 20 03:06 UTC, Sep 22 18:44 UTC.
        expect(subsolarPoint(Date.UTC(2024, 2, 20, 3, 6)).latDeg).toBeCloseTo(0, 1);
        expect(Math.abs(subsolarPoint(Date.UTC(2024, 8, 22, 18, 44)).latDeg)).toBeLessThan(0.2);
    });

    it('subsolar latitude hits the tropics at the solstices', () => {
        // 2024 solstice moments: Jun 20 20:51 UTC (summer, north), Dec 21 09:21 UTC (south).
        expect(subsolarPoint(Date.UTC(2024, 5, 20, 20, 51)).latDeg).toBeCloseTo(23.44, 1);
        expect(subsolarPoint(Date.UTC(2024, 11, 21, 9, 21)).latDeg).toBeCloseTo(-23.44, 1);
    });

    it('subsolar longitude is near 0° at 12:00 UTC and near 180° at 00:00 UTC', () => {
        // Equation of time keeps the noon subsolar meridian within ±4° of 0°.
        const noon = subsolarPoint(Date.UTC(2024, 5, 20, 12));
        expect(Math.abs(noon.lonDeg)).toBeLessThan(5);
        const midnight = subsolarPoint(Date.UTC(2024, 5, 21, 0));
        // Near ±180°; both sides count as the antipodal meridian.
        const antipodal = Math.abs(Math.abs(midnight.lonDeg) - 180);
        expect(antipodal).toBeLessThan(5);
    });

    it('ECF sun frame agrees with the subsolar point', () => {
        const dateMs = Date.UTC(2024, 5, 20, 12);
        const ecf = sunEcfDirection(dateMs);
        const sub = subsolarPoint(dateMs);
        const hyp = Math.hypot(ecf.x, ecf.y);
        const ecfLat = Math.atan2(ecf.z, hyp) * (180 / Math.PI);
        const ecfLon = Math.atan2(ecf.y, ecf.x) * (180 / Math.PI);
        // Sun elevation is 90° at the subsolar point.
        expect(ecfLat).toBeCloseTo(sub.latDeg, 6);
        expect(((ecfLon - sub.lonDeg + 540) % 360) - 180).toBeCloseTo(0, 6);
        // The subsolar point faces the sun: the ECF unit vector points at it.
        expect(ecfLon).toBeCloseTo(sub.lonDeg, 6);
    });

    it('sun distance is near 1 AU at perihelion and aphelion', () => {
        expect(Math.abs(sunDistanceKm(Date.UTC(2024, 0, 3)) - 147099858)).toBeLessThan(2e4);
        expect(Math.abs(sunDistanceKm(Date.UTC(2024, 6, 5)) - 152097707)).toBeLessThan(2e4);
    });
});

describe('cylindrical eclipse classification', () => {
    // Sun fixed on +x; Earth radius R. Behind Earth = negative x.
    const sun: Vec3 = { x: 1, y: 0, z: 0 };
    const R = EARTH_EQUATORIAL_RADIUS_KM;

    it('sunlit on the sunward half-space regardless of off-axis distance', () => {
        expect(isSunlit({ x: 2 * R, y: 0, z: 0 }, sun)).toBe(true);
        expect(isSunlit({ x: 0.001 * R, y: 10 * R, z: 0 }, sun)).toBe(true);
    });

    it('eclipsed when behind Earth and inside the shadow cylinder', () => {
        expect(isSunlit({ x: -2 * R, y: 0, z: 0 }, sun)).toBe(false);
        expect(isSunlit({ x: -2 * R, y: 0.5 * R, z: 0 }, sun)).toBe(false);
        // Grazes the cylinder boundary from inside.
        expect(isSunlit({ x: -2 * R, y: 0.99 * R, z: 0 }, sun)).toBe(false);
    });

    it('sunlit when behind Earth but outside the shadow cylinder', () => {
        expect(isSunlit({ x: -2 * R, y: 2 * R, z: 0 }, sun)).toBe(true);
        expect(isSunlit({ x: -0.5 * R, y: 1.001 * R, z: 0 }, sun)).toBe(true);
    });

    it('uses a generic tilted sun vector, not just +x', () => {
        const s = sunEciDirection(Date.UTC(2024, 5, 20));
        // A position ~0.5 R off the anti-sun axis, well behind Earth.
        const behind = {
            x: -2 * R * s.x,
            y: -2 * R * s.y,
            z: -2 * R * s.z
        };
        expect(isSunlit(behind, s)).toBe(false);
        const aside = {
            x: -2 * R * s.x + 2 * R,
            y: -2 * R * s.y,
            z: -2 * R * s.z
        };
        expect(isSunlit(aside, s)).toBe(true);
    });
});
