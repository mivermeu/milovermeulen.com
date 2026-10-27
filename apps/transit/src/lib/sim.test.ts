import { describe, expect, test } from 'bun:test';
import type { PatternGeometry, Snapshot, SnapshotTrain, TrainMotion } from './types';
import { advance, fromSnapshot, haversine, positionAt } from './sim';

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
        ...overrides
    };
}

function snapshot(trains: SnapshotTrain[], generatedAt = 1000): Snapshot {
    return {
        v: 1,
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
        v: 10,
        confidence: 0.9,
        stale: false,
        reset: false,
        route: 'A',
        dir: 'N',
        status: 'IN_TRANSIT_TO',
        stop: 'S1',
        next: [],
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

describe('advance', () => {
    test('rolls over to the next edge when passing a stop', () => {
        const next = advance(motion({ edge: 0, s: 95, sTotal: 95 }), 1, straightGeometry());
        expect(next.edge).toBe(1);
        expect(next.s).toBeCloseTo(5, 9);
        expect(next.sTotal).toBeCloseTo(105, 9);
        expect(next.v).toBe(10);
    });

    test('stops at the terminal with v = 0', () => {
        const next = advance(motion({ edge: 2, s: 95, sTotal: 295, v: 10 }), 2, straightGeometry());
        expect(next.sTotal).toBe(300);
        expect(next.edge).toBe(2);
        expect(next.s).toBe(100);
        expect(next.v).toBe(0);
    });

    test('crosses several edges in one step without overshooting', () => {
        const next = advance(motion({ edge: 0, s: 10, sTotal: 10, v: 60 }), 10, straightGeometry());
        expect(next.sTotal).toBe(300);
        expect(next.edge).toBe(2);
        expect(next.v).toBe(0);
    });

    test('leaves a stopped train alone and does not mutate it', () => {
        const parked = motion({ edge: 1, s: 40, sTotal: 140, v: 0 });
        expect(advance(parked, 5, straightGeometry())).toBe(parked);
    });

    test('ignores non-finite and negative dt', () => {
        const current = motion({ edge: 1, s: 40, sTotal: 140, v: 8 });
        expect(advance(current, Number.NaN, straightGeometry())).toBe(current);
        expect(advance(current, Number.POSITIVE_INFINITY, straightGeometry())).toBe(current);
        expect(advance(current, Number.NEGATIVE_INFINITY, straightGeometry())).toBe(current);
        expect(advance(current, -5, straightGeometry())).toBe(current);
        expect(advance(current, 0, straightGeometry())).toBe(current);
    });

    test('treats a non-finite velocity as stopped', () => {
        const current = motion({ edge: 1, s: 40, sTotal: 140, v: Number.POSITIVE_INFINITY });
        expect(advance(current, 1, straightGeometry())).toBe(current);
    });

    test('parks a train that is already at the terminal', () => {
        const next = advance(motion({ edge: 2, s: 100, sTotal: 300, v: 5 }), 1, straightGeometry());
        expect(next.sTotal).toBe(300);
        expect(next.v).toBe(0);
    });

    test('does not mutate the motion it was given', () => {
        const current = motion({ edge: 0, s: 95, sTotal: 95, v: 10 });
        advance(current, 1, straightGeometry());
        expect(current.edge).toBe(0);
        expect(current.sTotal).toBe(95);
    });

    test('preserves reset and stale flags while moving', () => {
        const next = advance(
            motion({ edge: 0, s: 95, sTotal: 95, reset: true, stale: true }),
            1,
            straightGeometry()
        );
        expect(next.reset).toBe(true);
        expect(next.stale).toBe(true);
    });

    test('keeps moving trains behind the terminal', () => {
        const next = advance(motion({ edge: 2, s: 90, sTotal: 290, v: 5 }), 1, straightGeometry());
        expect(next.sTotal).toBe(295);
        expect(next.v).toBe(5);
    });
});
