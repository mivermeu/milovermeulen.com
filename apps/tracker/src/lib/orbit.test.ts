import { describe, it, expect } from 'bun:test';
import { orbitalElements } from './orbit';

// ISS, real TLE line 2.
const ISS_LINE2 = '2 25544  51.6400 200.0000 0005000 100.0000 260.0000 15.49000000400000';

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
