import { describe, expect, it } from 'bun:test';
import {
    ecfToLookAngles,
    gstime,
    propagate,
    eciToEcf,
    twoline2satrec,
    type EciVec3,
    type SatRec
} from 'satellite.js';
import {
    capCandidates,
    findPasses,
    planeScreensOut,
    type PassCandidate,
    type PassRow,
    type PassVisibilityGate
} from './passes';

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// Synthetic TLE construction (fixed epoch + elements, valid layout/chechsums)
// ---------------------------------------------------------------------------

function tleChecksum(base68: string): string {
    let sum = 0;
    for (let i = 0; i < 68; i++) {
        const ch = base68[i];
        if (ch >= '0' && ch <= '9') sum += ch.charCodeAt(0) - 48;
        else if (ch === '-') sum += 1;
    }
    return String(sum % 10);
}

function fixed(value: number, intLen: number, fracLen: number): string {
    const clamped = Math.max(0, value); // TLE angles are 0-360
    const text = clamped.toFixed(fracLen); // e.g. '45.0000'
    return text.padStart(intLen + 1 + fracLen, '0');
}

/**
 * Build a two-line element set by hand (fixed epoch + fixed elements), column-
 * aligned with satellite.js's parser:
 *   line 1: epoch yr cols 19-20, epoch day 21-32, ndot 34-43, nddot 45-52,
 *           bstar 54-61, ephemeris type + element set 62-68
 *   line 2: inclination 9-16, RAAN 18-25, ecc 27-33, argp 35-42, M 44-51,
 *           mean motion 53-63, element set 64-68
 */
function makeTle(opts: {
    satnum: number;
    epochYear: number;
    epochDay: number; // day of year, fractional
    inclinationDeg: number;
    raanDeg: number;
    ecc7: number; // eccentricity, 7 digits (e.g. 6317 => 0.0006317)
    argpDeg: number;
    meanAnomalyDeg: number;
    meanMotionRevPerDay: number;
}): [string, string] {
    const sat = String(opts.satnum).padStart(5, '0');
    const epoch = String(opts.epochYear % 100) + fixed(opts.epochDay, 3, 8); // YYDDD.DDDDDDDD (12)
    const line1base =
        `1 ${sat}U 98067A   ` + // 18 chars: cols 1-18
        epoch + // cols 19-32
        ' ' + // col 33
        ' .00000000' + // col 34-43 (ndot)
        ' ' + // col 44
        ' 00000-0' + // col 45-52 (nddot)
        ' ' + // col 53
        ' 10000-3' + // col 54-61 (bstar)
        ' 0  999'; // col 62-68
    const line2base =
        `2 ${sat} ` + // 8 chars: cols 1-8
        fixed(opts.inclinationDeg, 3, 4) + // col 9-16
        ' ' + // col 17
        fixed(opts.raanDeg, 3, 4) + // col 18-25
        ' ' + // col 26
        String(opts.ecc7).padStart(7, '0') + // col 27-33
        ' ' + // col 34
        fixed(opts.argpDeg, 3, 4) + // col 35-42
        ' ' + // col 43
        fixed(opts.meanAnomalyDeg, 3, 4) + // col 44-51
        ' ' + // col 52
        opts.meanMotionRevPerDay.toFixed(8).padStart(11, '0') + // col 53-63
        '  999'; // col 64-68
    if (line1base.length !== 68 || line2base.length !== 68) {
        throw new Error(`bad TLE column layout: ${line1base.length} / ${line2base.length}`);
    }
    return [line1base + tleChecksum(line1base), line2base + tleChecksum(line2base)];
}

function makeCandidate(
    opts: Parameters<typeof makeTle>[0] & { name: string; index: number }
): PassCandidate {
    const [line1, line2] = makeTle(opts);
    return { name: opts.name, rec: twoline2satrec(line1, line2), index: opts.index };
}

// Fixed geometry: TLE epoch Jan 1 2026 00:00 UTC; search windows are absolute.
const EPOCH_MS = Date.UTC(2026, 0, 1);
const obsGd = (latDeg: number, lonDeg: number) => ({
    latitude: latDeg * RAD,
    longitude: lonDeg * RAD,
    height: 0
});

function elevationDeg(rec: SatRec, tMs: number, latDeg: number, lonDeg: number): number {
    const pv = propagate(rec, new Date(tMs));
    if (pv.position === false || pv.position === undefined) return -90;
    const ecf = eciToEcf(pv.position as EciVec3<number>, gstime(new Date(tMs)));
    return ecfToLookAngles(obsGd(latDeg, lonDeg), ecf).elevation * DEG;
}

// ---------------------------------------------------------------------------
// Brute-force reference: dense scan + fine bisection. Slow but trustworthy.
// ---------------------------------------------------------------------------

interface RefPass {
    startMs: number;
    endMs: number;
    maxElDeg: number;
}

function brutePasses(
    rec: SatRec,
    latDeg: number,
    lonDeg: number,
    startMs: number,
    endMs: number,
    minEl = 10,
    stepMs = 5000
): RefPass[] {
    const passes: RefPass[] = [];
    let runStart = -1;
    let maxEl = -90;
    for (let t = startMs; t <= endMs; t += stepMs) {
        const el = elevationDeg(rec, t, latDeg, lonDeg);
        if (el >= minEl) {
            if (runStart === -1) {
                runStart = t;
                maxEl = el;
            } else {
                maxEl = Math.max(maxEl, el);
            }
        } else if (runStart !== -1) {
            // Refine both crossings to 1s and re-scan the interior for the true max.
            let a = t - stepMs;
            let b = t;
            for (let i = 0; i < 20 && b - a > 1000; i++) {
                const mid = (a + b) / 2;
                if (elevationDeg(rec, mid, latDeg, lonDeg) >= minEl) a = mid;
                else b = mid;
            }
            let rise = runStart;
            let riseBefore = Math.max(startMs, runStart - stepMs);
            for (let i = 0; i < 20 && rise - riseBefore > 1000; i++) {
                const mid = (riseBefore + rise) / 2;
                if (elevationDeg(rec, mid, latDeg, lonDeg) >= minEl) rise = mid;
                else riseBefore = mid;
            }
            // Dense max-elevation scan inside [rise, set].
            let bestEl = -90;
            for (let t2 = rise; t2 <= a; t2 += 1000) {
                bestEl = Math.max(bestEl, elevationDeg(rec, t2, latDeg, lonDeg));
            }
            passes.push({
                startMs: Math.max(startMs, riseBefore),
                endMs: b,
                maxElDeg: bestEl
            });
            runStart = -1;
        }
    }
    if (runStart !== -1) {
        passes.push({ startMs: runStart, endMs: endMs, maxElDeg: maxEl });
    }
    return passes;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('capCandidates', () => {
    it('sorts by orbital period ascending and caps the count', () => {
        // Mean motions (rev/day): 15.5 (LEO), 12.4, 2.0, 1.0.
        const candidates = [
            makeCandidate({
                name: 'B-leo',
                index: 1,
                satnum: 2,
                epochYear: 26,
                epochDay: 1,
                inclinationDeg: 51,
                raanDeg: 10,
                ecc7: 1000,
                argpDeg: 0,
                meanAnomalyDeg: 0,
                meanMotionRevPerDay: 15.5
            }),
            makeCandidate({
                name: 'C-meo',
                index: 2,
                satnum: 3,
                epochYear: 26,
                epochDay: 1,
                inclinationDeg: 55,
                raanDeg: 20,
                ecc7: 2000,
                argpDeg: 0,
                meanAnomalyDeg: 0,
                meanMotionRevPerDay: 12.4
            }),
            makeCandidate({
                name: 'A-geo',
                index: 0,
                satnum: 1,
                epochYear: 26,
                epochDay: 1,
                inclinationDeg: 0.5,
                raanDeg: 30,
                ecc7: 500,
                argpDeg: 0,
                meanAnomalyDeg: 200,
                meanMotionRevPerDay: 1.0027
            }),
            makeCandidate({
                name: 'D',
                index: 3,
                satnum: 4,
                epochYear: 26,
                epochDay: 1,
                inclinationDeg: 55,
                raanDeg: 20,
                ecc7: 2000,
                argpDeg: 0,
                meanAnomalyDeg: 0,
                meanMotionRevPerDay: 2.0
            })
        ];
        const { capped, active, searched } = capCandidates(candidates, 2);
        expect(active).toBe(4);
        expect(searched).toBe(2);
        expect(capped.map((c) => c.name)).toEqual(['B-leo', 'C-meo']);
    });

    it('drops non-propagable records', () => {
        const broken = makeCandidate({
            name: 'bad',
            index: 9,
            satnum: 5,
            epochYear: 26,
            epochDay: 1,
            inclinationDeg: 51,
            raanDeg: 10,
            ecc7: 1000,
            argpDeg: 0,
            meanAnomalyDeg: 0,
            meanMotionRevPerDay: 15.5
        });
        broken.rec.no = -1; // simulate a record the search cannot use
        const good = makeCandidate({
            name: 'ok',
            index: 10,
            satnum: 6,
            epochYear: 26,
            epochDay: 1,
            inclinationDeg: 51,
            raanDeg: 10,
            ecc7: 1000,
            argpDeg: 0,
            meanAnomalyDeg: 0,
            meanMotionRevPerDay: 15.5
        });
        const { capped, active, searched } = capCandidates([broken, good], 10);
        expect(capped).toHaveLength(1);
        expect(capped[0]?.name).toBe('ok');
        expect(active).toBe(2);
        expect(searched).toBe(1);
    });
});

describe('findPasses — low-inclination LEO, observer near the equator', () => {
    // LEO at ~500 km, 10° inclination, 15.5 rev/day, observed from 5°N — the
    // sub-track dips well inside the visibility cone, so passes are frequent,
    // regular and independently checkable.
    const rec = makeCandidate({
        name: 'EQLEO',
        index: 42,
        satnum: 100,
        epochYear: 26,
        epochDay: 1,
        inclinationDeg: 10,
        raanDeg: 0,
        ecc7: 10,
        argpDeg: 0,
        meanAnomalyDeg: 0,
        meanMotionRevPerDay: 15.5
    }).rec;
    const LAT = 5;
    const LON = 0;
    const start = EPOCH_MS + 12 * 3600_000; // fixed: search from Jan 1 2026 12:00 UTC
    const end = start + 48 * 3600_000;

    it('matches the brute-force reference pass windows', () => {
        const iter = findPasses({
            candidates: [{ name: 'EQLEO', rec, index: 42 }],
            observer: { latDeg: LAT, lonDeg: LON },
            startMs: start,
            endMs: end,
            minElDeg: 10,
            maxPasses: 50
        });
        let result = iter.next();
        while (!result.done) result = iter.next();
        expect(result.value.partial).toBe(false);

        const reference = brutePasses(rec, LAT, LON, start, end);
        expect(reference.length).toBeGreaterThan(2);

        const found = result.value.passes;
        expect(found.length).toBe(reference.length);
        for (let i = 0; i < found.length; i++) {
            const f = found[i];
            const r = reference[i];
            expect(f.name).toBe('EQLEO');
            expect(f.index).toBe(42);
            expect(Math.abs(f.startMs - r.startMs)).toBeLessThanOrEqual(2000);
            expect(Math.abs(f.endMs - r.endMs)).toBeLessThanOrEqual(2000);
            expect(f.maxElDeg).toBeGreaterThanOrEqual(r.maxElDeg - 0.4);
            // Starts strictly ascending.
            if (i > 0) expect(f.startMs).toBeGreaterThan(found[i - 1].startMs);
        }
    });

    it('bisects the rise boundary onto the exact threshold', () => {
        const iter = findPasses({
            candidates: [{ name: 'EQLEO', rec, index: 42 }],
            observer: { latDeg: LAT, lonDeg: LON },
            startMs: start,
            endMs: end,
            minElDeg: 10,
            maxPasses: 1
        });
        let result = iter.next();
        while (!result.done) result = iter.next();
        const pass = result.value.passes[0];
        expect(pass).toBeDefined();
        expect(Math.abs(elevationDeg(rec, pass.startMs, LAT, LON) - 10)).toBeLessThan(0.05);
    });
});

describe('findPasses — inclined LEO over 45°N', () => {
    const rec = makeCandidate({
        name: 'INCL',
        index: 7,
        satnum: 101,
        epochYear: 26,
        epochDay: 1.25,
        inclinationDeg: 51.6,
        raanDeg: 45,
        ecc7: 1500,
        argpDeg: 90,
        meanAnomalyDeg: 30,
        meanMotionRevPerDay: 15.1
    }).rec;
    const start = EPOCH_MS + 6 * 3600_000;
    const end = start + 7 * 86_400_000;

    it('finds no more than maxPasses, sorted ascending, from the top of the window', () => {
        const iter = findPasses({
            candidates: [{ name: 'INCL', rec, index: 7 }],
            observer: { latDeg: 45, lonDeg: 7 },
            startMs: start,
            endMs: end,
            minElDeg: 10,
            maxPasses: 5
        });
        let result = iter.next();
        while (!result.done) result = iter.next();
        const { passes } = result.value;
        expect(passes.length).toBe(5);
        for (let i = 1; i < passes.length; i++) {
            expect(passes[i].startMs).toBeGreaterThanOrEqual(passes[i - 1].startMs);
        }

        // The returned passes are the chronologically FIRST ones — brute force
        // up past the last returned start must not find a pass that was skipped.
        const lastStart = passes[passes.length - 1].startMs;
        const expectedFirst = brutePasses(rec, 45, 7, start, lastStart + 60_000);
        expect(expectedFirst.length).toBeGreaterThanOrEqual(5);
        for (let i = 0; i < 5; i++) {
            expect(Math.abs(passes[i].startMs - expectedFirst[i].startMs)).toBeLessThanOrEqual(
                3000
            );
        }
    });

    it('matches the brute-force reference over the first 36 hours', () => {
        const window = start + 36 * 3600_000;
        const iter = findPasses({
            candidates: [{ name: 'INCL', rec, index: 7 }],
            observer: { latDeg: 45, lonDeg: 7 },
            startMs: start,
            endMs: window,
            minElDeg: 10,
            maxPasses: 50
        });
        let result = iter.next();
        while (!result.done) result = iter.next();
        const reference = brutePasses(rec, 45, 7, start, window);
        expect(reference.length).toBeGreaterThan(3);
        expect(result.value.passes.length).toBe(reference.length);
        result.value.passes.forEach((f: PassRow, i: number) => {
            const r = reference[i];
            expect(Math.abs(f.startMs - r.startMs)).toBeLessThanOrEqual(3000);
            expect(Math.abs(f.endMs - r.endMs)).toBeLessThanOrEqual(3000);
            expect(Math.abs(f.maxElDeg - r.maxElDeg)).toBeLessThanOrEqual(0.5);
        });
    });
});

describe('findPasses — edge cases', () => {
    it('returns no passes when the orbit plane never reaches the observer', () => {
        // Equatorial sat — 55°N can never see it above 10°.
        const rec = makeCandidate({
            name: 'EQLOW',
            index: 1,
            satnum: 200,
            epochYear: 26,
            epochDay: 1,
            inclinationDeg: 0.5,
            raanDeg: 0,
            ecc7: 10,
            argpDeg: 0,
            meanAnomalyDeg: 0,
            meanMotionRevPerDay: 15.5
        }).rec;
        const iter = findPasses({
            candidates: [{ name: 'EQLOW', rec, index: 1 }],
            observer: { latDeg: 55, lonDeg: 0 },
            startMs: EPOCH_MS,
            endMs: EPOCH_MS + 7 * 86_400_000,
            minElDeg: 10,
            maxPasses: 20
        });
        let result = iter.next();
        while (!result.done) result = iter.next();
        expect(result.value.passes).toHaveLength(0);
        expect(result.value.partial).toBe(false);
    });

    it('clips a pass already in progress at window start', () => {
        // Choose a window that starts mid-pass: epoch geometry known — brute
        // force first, then search exactly one pass interval.
        const rec = makeCandidate({
            name: 'CLIP',
            index: 1,
            satnum: 201,
            epochYear: 26,
            epochDay: 1,
            inclinationDeg: 45,
            raanDeg: 10,
            ecc7: 10,
            argpDeg: 0,
            meanAnomalyDeg: 0,
            meanMotionRevPerDay: 15.5
        }).rec;
        const firstPassRef = brutePasses(rec, 47, 60, EPOCH_MS, EPOCH_MS + 86_400_000);
        expect(firstPassRef.length).toBeGreaterThan(0);
        const midPassMs = Math.round((firstPassRef[0].startMs + firstPassRef[0].endMs) / 2);
        const iter = findPasses({
            candidates: [{ name: 'CLIP', rec, index: 1 }],
            observer: { latDeg: 47, lonDeg: 60 },
            startMs: midPassMs,
            endMs: midPassMs + 86_400_000,
            minElDeg: 10,
            maxPasses: 20
        });
        let result = iter.next();
        while (!result.done) result = iter.next();
        const clipped = result.value.passes[0];
        expect(clipped).toBeDefined();
        expect(clipped.startMs).toBe(midPassMs); // clip, not bisection
        expect(clipped.maxElDeg).toBeGreaterThanOrEqual(10);
    });

    it('honours a visibility gate', () => {
        const rec = makeCandidate({
            name: 'GATED',
            index: 1,
            satnum: 202,
            epochYear: 26,
            epochDay: 1,
            inclinationDeg: 45,
            raanDeg: 10,
            ecc7: 10,
            argpDeg: 0,
            meanAnomalyDeg: 0,
            meanMotionRevPerDay: 15.5
        }).rec;
        const start = EPOCH_MS;
        const end = EPOCH_MS + 2 * 86_400_000;
        const search = (gate?: PassVisibilityGate) => {
            const iter = findPasses({
                candidates: [{ name: 'GATED', rec, index: 1 }],
                observer: { latDeg: 47, lonDeg: 60 },
                startMs: start,
                endMs: end,
                minElDeg: 10,
                maxPasses: 20,
                gate
            });
            let result = iter.next();
            while (!result.done) result = iter.next();
            return result.value.passes;
        };
        const ungated = search();
        expect(ungated.length).toBeGreaterThan(0);

        const never = search(() => false);
        expect(never).toHaveLength(0);

        // Gate off the second half of the window: only earlier passes survive.
        const split = Math.floor(start + (end - start) / 2);
        const partial = search((vis) => vis.tMs < split);
        expect(partial.length).toBeGreaterThan(0);
        expect(partial.every((p) => p.endMs <= split)).toBe(true);
        // And every gated result also exists ungated with matching geometry.
        const byStart = new Map(ungated.map((p) => [p.startMs, p]));
        for (const p of partial) {
            const match = byStart.get(p.startMs);
            expect(match).toBeDefined();
            expect(match?.maxElDeg).toBeCloseTo(p.maxElDeg, 1);
        }
    });
});

describe('plane screen — near-boundary sun-sync regression (C1)', () => {
    // Regression for the plane-screen aliasing bug: sun-sync (i ≈ 98.2°)
    // orbits sweep their plane through mid-latitude observers twice daily,
    // and a coarse fixed-interval sample of the plane distance used to miss
    // every daily trough — screening out real passes. The analytic envelope
    // must keep them, and the search's counts must still match brute force.
    const LAT = 47.38;
    const LON = 8.54;
    const rec = (raanDeg: number) =>
        makeCandidate({
            name: `SUNSYNC-${raanDeg}`,
            index: 31,
            satnum: 300 + raanDeg,
            epochYear: 26,
            epochDay: 1,
            inclinationDeg: 98.2,
            raanDeg,
            ecc7: 10,
            argpDeg: 0,
            meanAnomalyDeg: 0,
            meanMotionRevPerDay: 14.9
        }).rec;

    it('screens no sun-sync satellite regardless of RAAN phase', () => {
        for (let raan = 0; raan < 360; raan += 45) {
            expect(planeScreensOut(rec(raan), LAT, 10)).toBe(false);
        }
    });

    it('finds the brute-force passes over 7 days for a near-boundary RAAN', () => {
        // RAAN 20° — reviewer's failing trial (search returned 0 of 28 passes).
        const rec20 = rec(20);
        const start = EPOCH_MS;
        const end = EPOCH_MS + 7 * 86_400_000;
        const iteration = findPasses({
            candidates: [{ name: 'SUNSYNC-20', rec: rec20, index: 31 }],
            observer: { latDeg: LAT, lonDeg: LON },
            startMs: start,
            endMs: end,
            minElDeg: 10,
            maxPasses: 50
        });
        let result = iteration.next();
        while (!result.done) result = iteration.next();
        expect(result.value.partial).toBe(false);

        const reference = brutePasses(rec20, LAT, LON, start, end);
        expect(reference.length).toBeGreaterThan(10);
        expect(result.value.passes.length).toBe(reference.length);
        result.value.passes.forEach((found, i) => {
            const expected = reference[i];
            expect(Math.abs(found.startMs - expected.startMs)).toBeLessThanOrEqual(3000);
            expect(Math.abs(found.endMs - expected.endMs)).toBeLessThanOrEqual(3000);
            expect(Math.abs(found.maxElDeg - expected.maxElDeg)).toBeLessThanOrEqual(0.5);
        });
    });

    it('keeps the search correct across a RAAN sweep (passes always found, matching brute force)', () => {
        // A 3-day window keeps the brute force affordable across 8 RAANs.
        const start = EPOCH_MS;
        const end = EPOCH_MS + 3 * 86_400_000;
        for (let raan = 0; raan < 360; raan += 45) {
            const r = rec(raan);
            const iteration = findPasses({
                candidates: [{ name: `SUNSYNC-${raan}`, rec: r, index: 31 }],
                observer: { latDeg: LAT, lonDeg: LON },
                startMs: start,
                endMs: end,
                minElDeg: 10,
                maxPasses: 50
            });
            let result = iteration.next();
            while (!result.done) result = iteration.next();
            const reference = brutePasses(r, LAT, LON, start, end);
            expect(reference.length).toBeGreaterThan(5);
            expect(result.value.passes.length, `raan ${raan}`).toBe(reference.length);
        }
    });
});
