import { describe, it, expect } from 'bun:test';
import {
    parseTrackerUrlParams,
    encodeTrackerUrlParams,
    noradIdFromLine1,
    catalogByNorad,
    DEFAULT_URL_PARAMS,
    type TrackerUrlParams
} from './url-state';

describe('noradIdFromLine1', () => {
    const LINE1 = '1 25544U 98067A   24275.50000000  .00016717  00000-0  10270-3 0  9990';

    it('reads cols 3–7 of TLE line 1', () => {
        expect(noradIdFromLine1(LINE1)).toBe(25544);
        expect(
            noradIdFromLine1(
                '1 45000U 20001A   24275.50000000  .00001000  00000-0  50000-4 0  9999'
            )
        ).toBe(45000);
    });

    it('returns null for garbage lines', () => {
        expect(noradIdFromLine1('')).toBeNull();
        expect(noradIdFromLine1('not a tle line at all')).toBeNull();
        expect(
            noradIdFromLine1(
                '1 XXXXXU 98067A   24275.50000000  .00016717  00000-0  10270-3 0  9990'
            )
        ).toBeNull();
    });
});

describe('catalogByNorad', () => {
    it('maps NORAD id -> index, keeping the first occurrence', () => {
        const map = catalogByNorad([
            { line1: '1 25544U 98067A   24275.50000000  .00016717  00000-0  10270-3 0  9990' },
            { line1: '1 45000U 20001A   24275.50000000  .00001000  00000-0  50000-4 0  9999' },
            { line1: 'garbage' }
        ]);
        expect(map.get(25544)).toBe(0);
        expect(map.get(45000)).toBe(1);
        expect(map.size).toBe(2);
    });
});

describe('parseTrackerUrlParams', () => {
    it('parses valid params', () => {
        const p = parseTrackerUrlParams('?sat=25544&mode=epoch&frame=eci&gx=i&gy=period');
        expect(p).toEqual({
            sat: 25544,
            mode: 'epoch',
            frame: 'eci',
            gx: 'i',
            gy: 'period'
        });
    });

    it('ignores invalid values silently', () => {
        const p = parseTrackerUrlParams('?sat=abc&mode=frozen&frame=geodetic&gx=nope&gy=nope!');
        expect(p).toEqual({});
    });

    it('rejects non-integer or out-of-range sat ids', () => {
        expect(parseTrackerUrlParams('?sat=12.5').sat).toBeUndefined();
        expect(parseTrackerUrlParams('?sat=-4').sat).toBeUndefined();
        expect(parseTrackerUrlParams('?sat=999999').sat).toBeUndefined();
    });

    it('rejects values Number() would accept but the NORAD id scheme does not', () => {
        expect(parseTrackerUrlParams('?sat=0x1f').sat).toBeUndefined();
        // '+' decodes to a space in application/x-www-form-urlencoded.
        expect(parseTrackerUrlParams('?sat=+25544').sat).toBeUndefined();
        expect(parseTrackerUrlParams('?sat=25544').sat).toBe(25544);
        expect(parseTrackerUrlParams('?sat=00000').sat).toBe(0);
    });

    it('rejects unknown graph param keys', () => {
        expect(parseTrackerUrlParams('?gx=radius').gx).toBeUndefined();
        expect(parseTrackerUrlParams('?gy=nu').gy).toBe('nu'); // valid derived param
    });

    it('returns nothing for an empty query', () => {
        expect(parseTrackerUrlParams('')).toEqual({});
    });
});

describe('encodeTrackerUrlParams', () => {
    it('round-trips with the parser', () => {
        const params: TrackerUrlParams = {
            sat: 25544,
            mode: 'instantaneous',
            frame: 'eci',
            gx: 'e',
            gy: 'period'
        };
        const encoded = encodeTrackerUrlParams(params);
        expect(parseTrackerUrlParams(`?${encoded}`)).toEqual(params);
    });

    it('drops values equal to the defaults', () => {
        const encoded = encodeTrackerUrlParams({
            mode: DEFAULT_URL_PARAMS.mode,
            frame: DEFAULT_URL_PARAMS.frame,
            gx: DEFAULT_URL_PARAMS.gx,
            gy: DEFAULT_URL_PARAMS.gy
        });
        expect(encoded).toBe('');
    });

    it('drops sat when unset', () => {
        expect(encodeTrackerUrlParams({ sat: undefined, mode: 'epoch' })).toBe('mode=epoch');
    });

    it('encodes everything back to empty when all values equal the defaults', () => {
        expect(
            encodeTrackerUrlParams({
                sat: undefined,
                mode: DEFAULT_URL_PARAMS.mode,
                frame: DEFAULT_URL_PARAMS.frame,
                gx: DEFAULT_URL_PARAMS.gx,
                gy: DEFAULT_URL_PARAMS.gy
            })
        ).toBe('');
    });
});
