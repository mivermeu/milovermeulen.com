import { describe, it, expect } from 'bun:test';
import { parseTleText } from './tle';

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
        expect(result[0].line1).toBe('1 25544U 98067A   24275.50000000  .00016717  00000-0  10270-3 0  9990');
        expect(result[0].line2).toBe('2 25544  51.6400 210.1000 0005000 130.2000 240.5000  15.4949000    10');
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
        const text = await readFile(
            join(import.meta.dir, 'data/sample-tles.txt'),
            'utf-8'
        );
        const result = parseTleText(text);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].name).toBeTruthy();
        expect(result[0].line1.startsWith('1 ')).toBe(true);
        expect(result[0].line2.startsWith('2 ')).toBe(true);
    });
});
