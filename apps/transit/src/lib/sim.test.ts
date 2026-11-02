import { describe, expect, test } from 'bun:test';
import type { PatternGeometry, Snapshot, SnapshotTrain, TrainMotion } from './types';
import {
    advance,
    bracketSlice,
    fromSnapshot,
    haversine,
    positionAt,
    profile,
    sliceAlong,
    timelineAt
} from './sim';

const EARTH_RADIUS_M = 6371008.8;
const LAT = 40.7;
const LON = -73.9;
const STEP_M = 100;
/** One 100 m step north, in degrees of latitude. */
const LAT_STEP = STEP_M / (EARTH_RADIUS_M * (Math.PI / 180));
/** A different step east, so a swapped [lat, lon] pair cannot pass. */
const LON_STEP = 2 * LAT_STEP;

/** The fixture is a Float32Array, so expectations go through the same rounding. */
const latAt = (index: number): number => Math.fround(LAT + index * LAT_STEP);
const lonAt = (index: number): number => Math.fround(LON + index * LON_STEP);

/**
 * A straight 4-point line with stops every 100 m. The diagonal (equal steps in
 * each axis) is not 100 m long on the ground, but `cumulative` is authoritative
 * for along-shape distances, so that does not matter.
 */
function straightGeometry(): PatternGeometry {
    const line = new Float32Array(8);
    const cumulative = new Float32Array(4);
    for (let i = 0; i < 4; i++) {
        line[i * 2] = latAt(i);
        line[i * 2 + 1] = lonAt(i);
        cumulative[i] = i * STEP_M;
    }
    return {
        id: 'pA',
        route: 'A',
        dir: 'N',
        length: 300,
        stops: [
            { stop: 'S0', dist: 0 },
            { stop: 'S1', dist: 100 },
            { stop: 'S2', dist: 200 },
            { stop: 'S3', dist: 300 }
        ],
        line,
        cumulative
    };
}

/** A 500 m line, long enough to exercise the hard-reset threshold. */
function longGeometry(): PatternGeometry {
    const points = 6;
    const line = new Float32Array(points * 2);
    const cumulative = new Float32Array(points);
    for (let i = 0; i < points; i++) {
        line[i * 2] = latAt(i);
        line[i * 2 + 1] = lonAt(i);
        cumulative[i] = i * STEP_M;
    }
    return {
        id: 'pB',
        route: 'B',
        dir: 'N',
        length: 500,
        stops: [
            { stop: 'L0', dist: 0 },
            { stop: 'L1', dist: 100 },
            { stop: 'L2', dist: 200 },
            { stop: 'L3', dist: 300 },
            { stop: 'L4', dist: 400 },
            { stop: 'L5', dist: 500 }
        ],
        line,
        cumulative
    };
}

function train(overrides: Partial<SnapshotTrain> = {}): SnapshotTrain {
    return {
        id: 'T1',
        trip: 'trip-1',
        route: 'A',
        dir: 'N',
        start_date: '20261026',
        status: 'IN_TRANSIT_TO',
        stop: 'S1',
        seq: 1,
        vehicle_ts: 1000,
        next: [{ stop: 'S2', arr: 1100, dep: 1120 }],
        pattern: 'pA',
        edge: 'pA:1:S1>S2',
        s: 40,
        s_total: 140,
        v: 8,
        confidence: 0.9,
        stale: false,
        reset: false,
        depart_at: 1060,
        sigma: 30,
        ...overrides
    };
}

function snapshot(trains: SnapshotTrain[], generatedAt = 1000): Snapshot {
    return {
        v: 2,
        generated_at: generatedAt,
        header_ts: 999,
        graph: 'deadbeef',
        feeds: {},
        scheduled_trips: 10,
        estimated: trains.length,
        trains,
        alerts: []
    };
}

function motion(overrides: Partial<TrainMotion> = {}): TrainMotion {
    return {
        id: 'T1',
        pattern: 'pA',
        edge: 0,
        s: 0,
        sTotal: 0,
        v: 0,
        confidence: 0.9,
        stale: false,
        reset: false,
        route: 'A',
        dir: 'N',
        status: 'STOPPED_AT',
        stop: 'S0',
        next: [{ stop: 'S1', arr: 1010, dep: 1015 }],
        departAt: 1000,
        sigma: 25,
        fade: 1,
        observedAt: 1000,
        ...overrides
    };
}

describe('positionAt', () => {
    test('returns the shape start at s = 0', () => {
        expect(positionAt(straightGeometry(), 0)).toEqual({ lng: lonAt(0), lat: latAt(0) });
    });

    test('lands on a stop at an exact stop distance', () => {
        expect(positionAt(straightGeometry(), 100)).toEqual({
            lng: lonAt(1),
            lat: latAt(1)
        });
    });

    test('interpolates mid-segment and returns [lng, lat] order', () => {
        const position = positionAt(straightGeometry(), 150);
        expect(position.lat).toBeCloseTo((latAt(1) + latAt(2)) / 2, 10);
        expect(position.lng).toBeCloseTo((lonAt(1) + lonAt(2)) / 2, 10);
        // The axes differ, so a lat/lon swap would fail the two assertions above.
        expect(position.lng).not.toBeCloseTo(position.lat, 6);
    });

    test('clamps below zero and beyond the pattern length', () => {
        const geometry = straightGeometry();
        expect(positionAt(geometry, -50)).toEqual(positionAt(geometry, 0));
        expect(positionAt(geometry, 10_000)).toEqual(positionAt(geometry, geometry.length));
        expect(positionAt(geometry, 10_000)).toEqual({
            lng: lonAt(3),
            lat: latAt(3)
        });
    });

    test('treats a non-finite distance as the start', () => {
        expect(positionAt(straightGeometry(), Number.NaN)).toEqual({
            lng: lonAt(0),
            lat: latAt(0)
        });
    });
});

describe('haversine', () => {
    test('is zero for a point against itself', () => {
        expect(haversine(40.7, -73.9, 40.7, -73.9)).toBe(0);
    });

    test('matches one degree of latitude on the backend radius', () => {
        expect(haversine(0, 0, 1, 0)).toBeCloseTo((EARTH_RADIUS_M * Math.PI) / 180, 6);
    });

    test('agrees with the 100 m fixture step', () => {
        expect(haversine(LAT, LON, LAT + LAT_STEP, LON)).toBeCloseTo(100, 6);
    });

    test('is symmetric', () => {
        const forward = haversine(40.7, -73.9, 40.75, -73.85);
        const reverse = haversine(40.75, -73.85, 40.7, -73.9);
        expect(forward).toBeCloseTo(reverse, 9);
        expect(forward).toBeGreaterThan(0);
    });
});

describe('profile', () => {
    test('is continuous, monotone and bounded', () => {
        for (const run of [30, 60, 180]) {
            let previous = 0;
            for (let step = 0; step <= 100; step++) {
                const [fraction, speed] = profile((run * step) / 100, run);
                expect(fraction).toBeGreaterThanOrEqual(0);
                expect(fraction).toBeLessThanOrEqual(1);
                expect(fraction).toBeGreaterThanOrEqual(previous - 1e-9);
                expect(speed).toBeGreaterThanOrEqual(0);
                previous = fraction;
            }
            expect(profile(0, run)).toEqual([0, 0]);
            expect(profile(run, run)).toEqual([1, 0]);
        }
    });

    test('matches the backend trapezoid shape', () => {
        // 10 s into a 60 s edge: past the 10.8 s acceleration ramp.
        const [fraction] = profile(10, 60);
        expect(fraction).toBeGreaterThan(0.08);
        expect(fraction).toBeLessThan(0.2);
    });
});

describe('fromSnapshot', () => {
    test('converts a positioned train and carries its metadata', () => {
        const trains = fromSnapshot(snapshot([train()]), new Map([['pA', straightGeometry()]]));
        const result = trains.get('T1');
        expect(result).toBeDefined();
        expect(result).toEqual({
            id: 'T1',
            pattern: 'pA',
            edge: 1,
            s: 40,
            sTotal: 140,
            v: 8,
            confidence: 0.9,
            stale: false,
            reset: false,
            route: 'A',
            dir: 'N',
            status: 'IN_TRANSIT_TO',
            stop: 'S1',
            next: [{ stop: 'S2', arr: 1100, dep: 1120 }],
            departAt: 1060,
            sigma: 30,
            fade: 1,
            observedAt: 1000
        });
    });

    test('derives s from s_total rather than trusting the snapshot s', () => {
        const trains = fromSnapshot(
            snapshot([train({ s: 5, s_total: 140 })]),
            new Map([['pA', straightGeometry()]])
        );
        expect(trains.get('T1')?.s).toBe(40);
    });

    test('defaults a missing velocity to stopped', () => {
        const trains = fromSnapshot(
            snapshot([train({ v: null })]),
            new Map([['pA', straightGeometry()]])
        );
        expect(trains.get('T1')?.v).toBe(0);
    });

    test('carries an absent departure as null instead of inventing one', () => {
        const trains = fromSnapshot(
            snapshot([train({ depart_at: null })]),
            new Map([['pA', straightGeometry()]])
        );
        expect(trains.get('T1')?.departAt).toBeNull();
    });

    test('keeps reset and stale flags set', () => {
        const trains = fromSnapshot(
            snapshot([train({ reset: true, stale: true })]),
            new Map([['pA', straightGeometry()]])
        );
        const result = trains.get('T1');
        expect(result?.reset).toBe(true);
        expect(result?.stale).toBe(true);
    });

    test('uses generated_at as observedAt', () => {
        const trains = fromSnapshot(
            snapshot([train()], 1717171717),
            new Map([['pA', straightGeometry()]])
        );
        expect(trains.get('T1')?.observedAt).toBe(1717171717);
    });

    test('drops trains with a missing pattern, edge or s_total', () => {
        const trains = fromSnapshot(
            snapshot([
                train({ id: 'no-pattern', pattern: null }),
                train({ id: 'no-edge', edge: null }),
                train({ id: 'no-s-total', s_total: null })
            ]),
            new Map([['pA', straightGeometry()]])
        );
        expect(trains.size).toBe(0);
    });

    test('drops trains whose pattern has no known geometry', () => {
        const trains = fromSnapshot(
            snapshot([train({ pattern: 'unknown', edge: 'unknown:0:S0>S1' })]),
            new Map([['pA', straightGeometry()]])
        );
        expect(trains.size).toBe(0);
    });

    test('drops malformed edges', () => {
        const malformed = [
            'garbage',
            'pA:one:S0>S1',
            'pA:1:S0S1',
            'pA:1:S0>',
            'pA:1:>S1',
            'pA:-1:S0>S1',
            'pA:1.5:S0>S1',
            'pA:9:S0>S1',
            'pA:3:S3>S3',
            ''
        ];
        const trains = fromSnapshot(
            snapshot(malformed.map((edge, index) => train({ id: `bad-${index}`, edge }))),
            new Map([['pA', straightGeometry()]])
        );
        expect(trains.size).toBe(0);
    });

    test('clamps s_total past the terminal and its local s', () => {
        const trains = fromSnapshot(
            snapshot([train({ edge: 'pA:2:S2>S3', s_total: 500, s: 500 })]),
            new Map([['pA', straightGeometry()]])
        );
        const result = trains.get('T1');
        expect(result?.edge).toBe(2);
        expect(result?.sTotal).toBe(300);
        expect(result?.s).toBe(100);
    });

    test('falls back to now when generated_at is unusable', () => {
        const trains = fromSnapshot(
            snapshot([train()], Number.NaN),
            new Map([['pA', straightGeometry()]]),
            1234
        );
        expect(trains.get('T1')?.observedAt).toBe(1234);
    });
});

describe('timelineAt', () => {
    const geometry = straightGeometry();

    test('waits at the platform until departure', () => {
        const state = motion({ edge: 0, departAt: 1000 });
        expect(timelineAt(state, geometry, 995)).toEqual({ sTotal: 0, v: 0 });
        expect(timelineAt(state, geometry, 1000)).toEqual({ sTotal: 0, v: 0 });
    });

    test('accelerates, cruises and arrives at the next stop', () => {
        const state = motion({
            edge: 0,
            departAt: 1000,
            next: [{ stop: 'S1', arr: 1060, dep: 1070 }]
        });
        const quarter = timelineAt(state, geometry, 1015);
        const half = timelineAt(state, geometry, 1030);
        const arrival = timelineAt(state, geometry, 1060);
        expect(quarter.sTotal).toBeGreaterThan(0);
        expect(quarter.sTotal).toBeLessThan(half.sTotal);
        expect(half.sTotal).toBeGreaterThan(30);
        expect(half.sTotal).toBeLessThan(70);
        expect(arrival.sTotal).toBeCloseTo(100, 9);
    });

    test('dwells at the stop and then runs to the following one', () => {
        const state = motion({
            edge: 0,
            departAt: 1000,
            next: [
                { stop: 'S1', arr: 1060, dep: 1075 },
                { stop: 'S2', arr: 1135, dep: 1145 }
            ]
        });
        const dwell = timelineAt(state, geometry, 1068);
        const running = timelineAt(state, geometry, 1100);
        expect(dwell.sTotal).toBeCloseTo(100, 9);
        expect(running.sTotal).toBeGreaterThan(100);
        expect(running.sTotal).toBeLessThan(200);
    });

    test('does not overshoot the last planned stop', () => {
        const state = motion({
            edge: 0,
            departAt: 1000,
            next: [
                { stop: 'S1', arr: 1060, dep: 1070 },
                { stop: 'S2', arr: 1130, dep: 1140 }
            ]
        });
        expect(timelineAt(state, geometry, 10_000).sTotal).toBe(200);
    });

    test('a terminal train with no timeline stays put', () => {
        const state = motion({ edge: 2, departAt: 900, sTotal: 300, next: [] });
        expect(timelineAt(state, geometry, 1200)).toEqual({ sTotal: 300, v: 0 });
    });
});

describe('advance', () => {
    const geometry = straightGeometry();

    test('eases toward the timeline instead of jumping to it', () => {
        // 300 m correction, one 60 fps frame: the step is bounded.
        const current = motion({ edge: 0, sTotal: 0, departAt: 1000 });
        const next = advance(current, 1 / 60, geometry, 1000);
        expect(next.sTotal).toBeGreaterThanOrEqual(0);
        expect(next.sTotal).toBeLessThanOrEqual(60 / 60);
    });

    test('converges on the timeline over a second', () => {
        const current = motion({
            edge: 0,
            sTotal: 0,
            departAt: 1000,
            next: [{ stop: 'S1', arr: 1060, dep: 1070 }]
        });
        let state = current;
        for (let frame = 0; frame < 1200; frame++) {
            state = advance(state, 1 / 60, geometry, 1030);
        }
        const target = timelineAt(current, geometry, 1030).sTotal;
        expect(state.sTotal).toBeCloseTo(target, 0);
    });

    test('adopts a hard correction and fades it in', () => {
        const line = longGeometry();
        const current = motion({
            edge: 0,
            sTotal: 500,
            departAt: 2000,
            next: [{ stop: 'L1', arr: 2060, dep: 2070 }]
        });
        const next = advance(current, 1 / 60, line, 1000);
        expect(next.sTotal).toBeCloseTo(timelineAt(current, line, 1000).sTotal, 6);
        expect(next.fade).toBeLessThan(0.1);
    });

    test('eases a small correction without a fade', () => {
        const current = motion({
            edge: 0,
            sTotal: 90,
            departAt: 1000,
            next: [{ stop: 'S1', arr: 1010, dep: 1015 }]
        });
        const next = advance(current, 1 / 60, geometry, 1000);
        expect(next.fade).toBeGreaterThan(0.9);
    });

    test('adopts a reset immediately', () => {
        const current = motion({
            edge: 0,
            sTotal: 0,
            departAt: 1000,
            reset: true,
            next: [{ stop: 'S1', arr: 1060, dep: 1070 }]
        });
        const next = advance(current, 1 / 60, geometry, 1030);
        expect(next.sTotal).toBeCloseTo(timelineAt(current, geometry, 1030).sTotal, 9);
    });

    test('stops at the terminal with v = 0', () => {
        const current = motion({ edge: 2, departAt: 1000, sTotal: 300, next: [] });
        const next = advance(current, 1, geometry, 1200);
        expect(next.sTotal).toBe(300);
        expect(next.v).toBe(0);
    });

    test('a terminal train without a timeline does not invent motion', () => {
        const current = motion({ edge: 2, departAt: 1000, sTotal: 295, next: [] });
        const next = advance(current, 1, geometry, 1200);
        expect(next.sTotal).toBe(295);
    });

    test('ignores non-finite and non-positive dt', () => {
        const current = motion({ sTotal: 40 });
        for (const dt of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0]) {
            expect(advance(current, dt, geometry, 1000)).toBe(current);
        }
    });

    test('does not mutate the motion it was given', () => {
        const current = motion({ sTotal: 40, departAt: 1000 });
        advance(current, 1, geometry, 1010);
        expect(current.sTotal).toBe(40);
        expect(current.edge).toBe(0);
    });

    test('preserves reset and stale flags while moving', () => {
        const next = advance(
            motion({ sTotal: 40, departAt: 1000, reset: true, stale: true }),
            1,
            geometry,
            1010
        );
        expect(next.reset).toBe(true);
        expect(next.stale).toBe(true);
    });

    test('never steps further than the blend cap, even against a wild timeline', () => {
        const current = motion({
            edge: 0,
            sTotal: 0,
            departAt: 1000,
            next: [{ stop: 'S3', arr: 1001, dep: 1002 }]
        });
        let state = current;
        let previous = state.sTotal;
        for (let frame = 0; frame < 240; frame++) {
            state = advance(state, 1 / 60, geometry, 1000 + frame / 60);
            expect(Math.abs(state.sTotal - previous)).toBeLessThanOrEqual(60 / 60 + 1e-6);
            previous = state.sTotal;
        }
    });
});

describe('sliceAlong', () => {
    const geometry = straightGeometry();

    test('returns exact endpoints for a stop-to-stop slice', () => {
        expect(sliceAlong(geometry, 0, 100)).toEqual([
            [lonAt(0), latAt(0)],
            [lonAt(1), latAt(1)]
        ]);
    });

    test('includes intermediate vertices', () => {
        const points = sliceAlong(geometry, 50, 150);
        expect(points).toHaveLength(3);
        expect(points[1]).toEqual([lonAt(1), latAt(1)]);
        expect(points[0][0]).toBeGreaterThan(lonAt(0));
        expect(points[2][0]).toBeLessThan(lonAt(2));
    });

    test('normalises a reversed range', () => {
        expect(sliceAlong(geometry, 150, 50)).toEqual(sliceAlong(geometry, 50, 150));
    });

    test('returns nothing for an empty or out-of-range slice', () => {
        expect(sliceAlong(geometry, 100, 100)).toEqual([]);
        expect(sliceAlong(geometry, 400, 500)).toEqual([]);
    });

    test('clamps to the pattern length', () => {
        const points = sliceAlong(geometry, 250, 10_000);
        expect(points[points.length - 1]).toEqual([lonAt(3), latAt(3)]);
    });
});

describe('bracketSlice', () => {
    const geometry = straightGeometry();

    test('covers the current edge while running', () => {
        const state = motion({
            edge: 1,
            departAt: 1000,
            next: [{ stop: 'S2', arr: 1060, dep: 1070 }]
        });
        expect(bracketSlice(state, geometry, 1030)).toEqual(sliceAlong(geometry, 100, 200));
    });

    test('is empty while dwelling: the platform is the position', () => {
        const state = motion({
            edge: 1,
            departAt: 1040,
            next: [{ stop: 'S2', arr: 1100, dep: 1110 }]
        });
        expect(bracketSlice(state, geometry, 1000)).toEqual([]);
    });

    test('is empty without a timeline or at the terminal', () => {
        expect(bracketSlice(motion({ edge: 1, departAt: 1000, next: [] }), geometry, 1030)).toEqual(
            []
        );
        expect(bracketSlice(motion({ edge: 2, departAt: 1000, next: [] }), geometry, 1030)).toEqual(
            []
        );
    });
});
