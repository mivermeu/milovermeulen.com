import { describe, it, expect } from 'bun:test';
import { sourceLabel, eciSpeedKms } from './utils';

describe('sourceLabel', () => {
    it('maps all DataSource values', () => {
        expect(sourceLabel('celestrak')).toBe('CelesTrak (live)');
        expect(sourceLabel('sample')).toBe('Bundled sample');
        expect(sourceLabel('error')).toBe('No data');
        expect(sourceLabel('loading')).toBe('Loading\u2026');
    });
});

describe('eciSpeedKms', () => {
    it('is the euclidean magnitude of an ECI triple', () => {
        expect(eciSpeedKms({ x: 3, y: 4, z: 0 })).toBe(5);
        expect(eciSpeedKms({ x: 0, y: 0, z: 2 })).toBe(2);
        expect(eciSpeedKms({ x: 3, y: 4, z: 12 })).toBe(13);
    });

    it('lands in the LEO speed band for a genuine propagated velocity', () => {
        // A typical LEO velocity vector from SGP4: ~7.7 km/s.
        const v = eciSpeedKms({ x: -7.67, y: 0.604, z: 0 });
        expect(v).toBeGreaterThan(7);
        expect(v).toBeLessThan(8);
    });
});
