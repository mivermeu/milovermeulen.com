import { describe, it, expect } from 'bun:test';
import { parseTleText, tleEpochMs, partitionFresh, MAX_TLE_AGE_DAYS } from './tle';
import type { ParsedSatellite } from './types';

const SAMPLE_TLE = `ISS (ZARYA)
1 25544U 98067A   24275.50000000  .00016717  00000-0  10270-3 0  9990
2 25544  51.6400 210.1000 0005000 130.2000 240.5000  15.4949000    10`;

const MULTI_SAT = `ISS (ZARYA)
1 25544U 98067A   24275.50000000  .00016717  00000-0  10270-3 0  9990
2 25544  51.6400 210.1000 0005000 130.2000 240.5000  15.4949000    10
STARLINK-1000
1 45000U 20001A   24275.50000000  .00001000  00000-0  50000-4 0  9999
2 45000  53.0000 100.0000 0001000  90.0000 270.0000  15.0600000    20`;

describe('parseTleText', () => {
    it('parses a single satellite', () => {
        const result = parseTleText(SAMPLE_TLE);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('ISS (ZARYA)');
        expect(result[0].line1).toBe(
            '1 25544U 98067A   24275.50000000  .00016717  00000-0  10270-3 0  9990'
        );
        expect(result[0].line2).toBe(
            '2 25544  51.6400 210.1000 0005000 130.2000 240.5000  15.4949000    10'
        );
    });

    it('parses multiple satellites', () => {
        const result = parseTleText(MULTI_SAT);
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('ISS (ZARYA)');
        expect(result[1].name).toBe('STARLINK-1000');
    });

    it('returns empty array for no TLE data', () => {
        expect(parseTleText('')).toHaveLength(0);
        expect(parseTleText('just some text')).toHaveLength(0);
    });

    it('handles missing name line', () => {
        const noName = `1 25544U 98067A   24275.50000000  .00016717  00000-0  10270-3 0  9990
2 25544  51.6400 210.1000 0005000 130.2000 240.5000  15.4949000    10`;
        const result = parseTleText(noName);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('');
    });

    it('skips malformed entries (line2 missing)', () => {
        const bad = `SATELLITE
1 25544U 98067A   24275.50000000  .00016717  00000-0  10270-3 0  9990
ANOTHER
1 45000U 20001A   24275.50000000  .00001000  00000-0  50000-4 0  9999
2 45000  53.0000 100.0000 0001000  90.0000 270.0000  15.0600000    20`;
        const result = parseTleText(bad);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('ANOTHER');
    });

    it('handles CRLF line endings', () => {
        const crlf = SAMPLE_TLE.replace(/\n/g, '\r\n');
        const result = parseTleText(crlf);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('ISS (ZARYA)');
    });

    it('parses the bundled sample catalog', async () => {
        const { readFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const text = await readFile(join(import.meta.dir, 'data/sample-tles.txt'), 'utf-8');
        const result = parseTleText(text);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].name).toBeTruthy();
        expect(result[0].line1.startsWith('1 ')).toBe(true);
        expect(result[0].line2.startsWith('2 ')).toBe(true);
    });
});

const L1_TEMPLATE = '1 99999U 25001A   26250.50000000  .00000000  00000-0  00000-0 0  9991';

function line1At(whenMs: number): string {
    const d = new Date(whenMs);
    const year = d.getUTCFullYear();
    const dayOfYear =
        (Date.UTC(year, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(year, 0, 1)) / 86400000 +
        1 +
        (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400;
    const yy = String(year % 100).padStart(2, '0');
    const epochField = yy + dayOfYear.toFixed(8).padStart(12, '0');
    return L1_TEMPLATE.slice(0, 18) + epochField + L1_TEMPLATE.slice(32);
}

function satAt(name: string, whenMs: number): ParsedSatellite {
    return {
        name,
        line1: line1At(whenMs),
        line2: '2 99999  51.6400 100.0000 0005000  90.0000 270.0000 15.5000000    12'
    };
}

describe('tleEpochMs', () => {
    it('parses a 2026 epoch', () => {
        expect(tleEpochMs(L1_TEMPLATE)).toBe(Date.UTC(2026, 0, 1) + (250.5 - 1) * 86400000);
    });

    it('parses the real Chandrayaan-2 epoch (Aug 2019)', () => {
        const line1 = '1 44441U 19042A   19230.00000000 -.00330169  19998-2  00000+0 0  9998';
        expect(tleEpochMs(line1)).toBe(Date.UTC(2019, 0, 1) + (230 - 1) * 86400000);
    });

    it('returns null for garbage', () => {
        expect(tleEpochMs('not a tle line')).toBeNull();
    });
});

describe('partitionFresh', () => {
    const NOW = Date.UTC(2026, 8, 12);
    const DAY = 86400000;

    it('keeps fresh sats and counts stale ones', () => {
        const sats = [
            satAt('fresh', NOW - 10 * DAY),
            satAt('old', NOW - 40 * DAY),
            satAt('ancient', NOW - 365 * DAY),
            { name: 'garbage', line1: 'nope', line2: 'nope' }
        ];
        const { fresh, stale } = partitionFresh(sats, NOW);
        expect(fresh.map((s) => s.name)).toEqual(['fresh']);
        expect(stale).toBe(3);
    });

    it(`boundary is exactly ${MAX_TLE_AGE_DAYS} days`, () => {
        const ok = partitionFresh([satAt('edge', NOW - MAX_TLE_AGE_DAYS * DAY)], NOW);
        expect(ok.fresh).toHaveLength(1);
        const over = partitionFresh([satAt('over', NOW - MAX_TLE_AGE_DAYS * DAY - 1)], NOW);
        expect(over.fresh).toHaveLength(0);
        expect(over.stale).toBe(1);
    });
});
