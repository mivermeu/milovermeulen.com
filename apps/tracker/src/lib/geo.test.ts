import { describe, expect, it } from 'bun:test';
import { parseLatitude, parseLongitude } from './geo';

describe('manual coordinate parsing', () => {
    it('accepts decimal degrees inside the ranges', () => {
        expect(parseLatitude(' 47.38 ')).toBe(47.38);
        expect(parseLatitude('-33.9')).toBe(-33.9);
        expect(parseLatitude('+90')).toBe(90);
        expect(parseLongitude('8.54')).toBe(8.54);
        expect(parseLongitude('-180')).toBe(-180);
        expect(parseLongitude('179.999')).toBe(179.999);
        // European decimal comma.
        expect(parseLatitude('47,38')).toBe(47.38);
    });

    it('rejects anything out of range or non-numeric', () => {
        expect(parseLatitude('90.01')).toBeNull();
        expect(parseLatitude('-90.5')).toBeNull();
        expect(parseLongitude('180.1')).toBeNull();
        expect(parseLatitude('abc')).toBeNull();
        expect(parseLatitude('')).toBeNull();
        expect(parseLatitude('   ')).toBeNull();
        expect(parseLongitude('')).toBeNull();
        expect(parseLatitude('Infinity')).toBeNull();
        expect(parseLongitude('NaN')).toBeNull();
    });
});
