import { describe, it, expect } from 'bun:test';
import { orbitalElements, argumentOfLatitudeAt } from './orbit';

// ISS, real TLE line 2.
const ISS_LINE2 = '2 25544  51.6400 200.0000 0005000 100.0000 260.0000 15.49000000400000';

// A real Starlink TLE (epoch 2026 day 283.557).
const SL_L1 = '1 44714U 19074B   26283.55700749  .00047721  00000-0  45157-3 0  9995';
const SL_L2 = '2 44714  53.1452 228.6792 0002957 108.6784 251.4553 15.66512426382214';
const SL_EPOCH = Date.UTC(2026, 0, 1) + (283.55700749 - 1) * 86400000;

describe('orbitalElements', () => {
    it('parses the classical elements', () => {
        const el = orbitalElements(ISS_LINE2)!;
        expect(el.i).toBeCloseTo(51.64, 4);
        expect(el.raan).toBeCloseTo(200.0, 4);
        expect(el.e).toBeCloseTo(0.0005, 6);
        expect(el.argp).toBeCloseTo(100.0, 4);
        expect(el.m).toBeCloseTo(260.0, 4);
    });

    it('derives semi-major axis from mean motion (ISS is ~6796 km)', () => {
        const el = orbitalElements(ISS_LINE2)!;
        expect(el.a).toBeGreaterThan(6700);
        expect(el.a).toBeLessThan(6900);
    });

    it('returns null for unparsable input', () => {
        expect(orbitalElements('')).toBeNull();
        expect(orbitalElements('garbage')).toBeNull();
    });
});

describe('argumentOfLatitudeAt', () => {
    it('is ~0 at the TLE epoch (near-circular elements are given at the node)', () => {
        const u = argumentOfLatitudeAt(SL_L1, SL_L2, SL_EPOCH)!;
        expect(Math.min(u, 360 - u)).toBeLessThan(1);
    });

    it('advances ~90° in a quarter of a period', () => {
        const u0 = argumentOfLatitudeAt(SL_L1, SL_L2, SL_EPOCH)!;
        // period ≈ 1440/15.665 min ≈ 91.9 min; a quarter is ~23 min.
        const u1 = argumentOfLatitudeAt(SL_L1, SL_L2, SL_EPOCH + 23 * 60000)!;
        const du = (((u1 - u0) % 360) + 360) % 360;
        expect(du).toBeGreaterThan(80);
        expect(du).toBeLessThan(100);
    });

    it('returns null for unparsable input', () => {
        expect(argumentOfLatitudeAt('garbage', 'garbage', SL_EPOCH)).toBeNull();
    });
});
