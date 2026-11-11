import { describe, expect, test } from 'bun:test';

import { buildProgressChart, newYorkClock } from './progress';
import type { PatternGeometry, PatternHistory, TrainMotion } from './types';

/** 2026-11-11 12:00 UTC = 07:00 EST, a Wednesday. */
const NOW = 1_794_398_400;

function geometry(): PatternGeometry {
    const line = new Float32Array([40.7, -73.9, 40.701, -73.9, 40.702, -73.9, 40.703, -73.9]);
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
        cumulative: new Float32Array([0, 100, 200, 300])
    };
}

function motion(overrides: Partial<TrainMotion> = {}): TrainMotion {
    return {
        id: 'T1',
        pattern: 'pA',
        edge: 1,
        s: 0,
        sTotal: 100,
        v: 10,
        confidence: 0.9,
        stale: false,
        reset: false,
        route: 'A',
        dir: 'N',
        status: 'IN_TRANSIT_TO',
        stop: 'S1',
        next: [
            { stop: 'S2', arr: NOW + 60, dep: NOW + 70 },
            { stop: 'S3', arr: NOW + 150, dep: NOW + 160 }
        ],
        departAt: NOW - 30,
        sigma: 50,
        fade: 1,
        observedAt: NOW,
        ...overrides
    };
}

function history(overrides: Partial<PatternHistory> = {}): PatternHistory {
    return {
        v: 1,
        pattern: 'pA',
        edges: {
            all: [
                [40, 60, 120],
                [40, 60, 120],
                [40, 60, 120]
            ],
            weekday: [
                [40, 60, 120],
                [40, 60, 120],
                [40, 60, 120]
            ],
            weekend: [
                [60, 90, 150],
                [60, 90, 150],
                [60, 90, 150]
            ]
        },
        runs: [],
        ...overrides
    };
}

describe('newYorkClock', () => {
    test('is New York time, not the machine timezone', () => {
        expect(newYorkClock(NOW)).toEqual({ hour: 7, weekend: false });
    });
});

describe('buildProgressChart', () => {
    test('starts at the current position and projects forward', () => {
        const chart = buildProgressChart(motion(), geometry(), null, NOW, []);
        expect(chart.hasProjection).toBe(true);
        expect(chart.projection[0].ds).toBeCloseTo(0, 6);
        expect(chart.projection[chart.projection.length - 1].ds).toBeGreaterThan(0);
        expect(chart.hasHistory).toBe(false);
        expect(chart.stops.length).toBe(2);
        expect(chart.stops[0].x).toBe(60);
    });

    test('builds a widening band from edge quantiles', () => {
        const chart = buildProgressChart(motion(), geometry(), history(), NOW, []);
        expect(chart.hasHistory).toBe(true);
        const atZero = chart.band.find((point) => point.x === 0);
        expect(atZero?.low).toBeCloseTo(0, 6);
        expect(atZero?.median).toBeCloseTo(0, 6);
        expect(atZero?.high).toBeCloseTo(0, 6);

        const later = chart.band.find((point) => point.x === 45);
        expect(later).toBeDefined();
        expect(later!.high).toBeGreaterThan(later!.median);
        expect(later!.median).toBeGreaterThan(later!.low);
    });

    test('uses the day-type table', () => {
        const weekday = buildProgressChart(motion(), geometry(), history(), NOW, []);
        const weekendNow = NOW + 4 * 86400;
        const weekend = buildProgressChart(
            motion({ departAt: weekendNow - 30 }),
            geometry(),
            history(),
            weekendNow,
            []
        );
        // The weekend edge times are slower, so the slow edge of the band is
        // further behind at the same clock time.
        const weekdayLater = weekday.band.find((point) => point.x === 15);
        const weekendLater = weekend.band.find((point) => point.x === 15);
        expect(weekdayLater).toBeDefined();
        expect(weekendLater).toBeDefined();
        expect(weekendLater!.median).toBeLessThan(weekdayLater!.median);
    });

    test('falls back to the all-day table', () => {
        const chart = buildProgressChart(
            motion(),
            geometry(),
            history({
                edges: {
                    all: [
                        [40, 60, 120],
                        [40, 60, 120],
                        [40, 60, 120]
                    ]
                }
            }),
            NOW,
            []
        );
        expect(chart.hasHistory).toBe(true);
    });

    test('uses the observed past when it is available', () => {
        const past = [
            { t: NOW - 120, s: 40, v: 5 },
            { t: NOW - 60, s: 70, v: 8 },
            { t: NOW, s: 100, v: 10 }
        ];
        const chart = buildProgressChart(motion(), geometry(), null, NOW, past);
        expect(chart.past.length).toBeGreaterThan(0);
        expect(chart.past[chart.past.length - 1].ds).toBeCloseTo(0, 6);
    });

    test('domains always include the current position and have width', () => {
        const chart = buildProgressChart(motion(), geometry(), null, NOW, []);
        expect(chart.minDs).toBeLessThan(0);
        expect(chart.maxDs).toBeGreaterThan(0);
        expect(chart.maxDs - chart.minDs).toBeGreaterThanOrEqual(400);
        expect(chart.velMax).toBeGreaterThanOrEqual(10);
    });
});
