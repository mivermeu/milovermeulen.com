import { describe, expect, test } from 'bun:test';

import { buildProgressChart, crossTime, newYorkClock, sampleRun, selectRuns } from './progress';
import type { HistoryRun, PatternGeometry, PatternHistory, TrainMotion } from './types';

/**
 * 2026-11-11 12:00 UTC = 07:00 EST, a Wednesday. Fixed so the time-of-day
 * filter cannot drift with the machine clock.
 */
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

function run(start: number, values: number[], h = 7, w: 0 | 1 = 0): HistoryRun {
    return { start, h, w, dt: 30, s: values };
}

describe('sampleRun', () => {
    test('interpolates distance and speed inside the run', () => {
        const value = sampleRun(run(NOW, [0, 100, 250]), NOW + 15);
        expect(value?.s).toBeCloseTo(50, 6);
        expect(value?.v).toBeCloseTo(250 / 60, 6);
    });

    test('returns null outside the run', () => {
        expect(sampleRun(run(NOW, [0, 100]), NOW - 1)).toBeNull();
        expect(sampleRun(run(NOW, [0, 100]), NOW + 31)).toBeNull();
    });
});

describe('crossTime', () => {
    test('interpolates the first crossing of the current distance', () => {
        expect(crossTime(run(NOW, [0, 100, 250]), 50)).toBeCloseTo(NOW + 15, 6);
        expect(crossTime(run(NOW, [0, 100, 250]), 100)).toBeCloseTo(NOW + 30, 6);
        expect(crossTime(run(NOW, [0, 100, 250]), 0)).toBe(NOW);
    });

    test('rejects a distance the run never covered', () => {
        expect(crossTime(run(NOW, [0, 100]), 200)).toBeNull();
    });
});

describe('selectRuns', () => {
    test('prefers the same day type within two hours', () => {
        const runs = [
            ...Array.from({ length: 6 }, () => run(NOW - 90_000, [0, 100], 7, 0)),
            ...Array.from({ length: 6 }, () => run(NOW - 80_000, [0, 100], 12, 0)),
            ...Array.from({ length: 6 }, () => run(NOW - 70_000, [0, 100], 7, 1))
        ];
        const selected = selectRuns({ v: 1, pattern: 'pA', runs }, NOW);
        expect(selected).toHaveLength(6);
        expect(selected.every((entry) => entry.h === 7 && entry.w === 0)).toBe(true);
    });

    test('widens before giving up', () => {
        const runs = [
            run(NOW - 90_000, [0, 100], 12, 0),
            run(NOW - 80_000, [0, 100], 7, 1),
            run(NOW - 70_000, [0, 100], 3, 1)
        ];
        expect(selectRuns({ v: 1, pattern: 'pA', runs }, NOW)).toHaveLength(3);
    });

    test('newYorkClock is New York time, not the machine timezone', () => {
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

    test('builds a historical band aligned at the current distance', () => {
        const values = Array.from({ length: 40 }, (_, index) => index * 25);
        const runs = Array.from({ length: 12 }, (_, index) =>
            run(NOW - 1000 - index * 60, values, 7, 0)
        );
        const history: PatternHistory = { v: 1, pattern: 'pA', runs };
        const chart = buildProgressChart(motion(), geometry(), history, NOW, []);
        expect(chart.hasHistory).toBe(true);
        expect(chart.runCount).toBe(12);
        const atZero = chart.band.find((point) => point.x === 0);
        expect(atZero?.median).toBeCloseTo(0, 6);
        expect(atZero?.low).toBeCloseTo(0, 6);
        expect(atZero?.high).toBeCloseTo(0, 6);
        const later = chart.band.find((point) => point.x === 300);
        expect(later).toBeDefined();
        expect(later!.high).toBeGreaterThanOrEqual(later!.median);
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
