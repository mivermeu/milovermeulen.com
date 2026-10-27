import { describe, expect, test } from 'bun:test';

import {
    feedLabel,
    feedTone,
    formatAge,
    formatConfidence,
    formatEta,
    formatSpeed,
    routeSortKey,
    sortRoutes,
    statusLabel
} from './format';
import type { FeedHealth } from './types';

const NOW = 1_800_000_000;

function feed(overrides: Partial<FeedHealth> = {}): FeedHealth {
    return {
        ok: true,
        status: 200,
        age_s: 5,
        trips: 10,
        vehicles: 10,
        alerts: 0,
        error: null,
        ...overrides
    };
}

describe('route ordering', () => {
    test('numbers come before letters, in numeric order', () => {
        expect(sortRoutes(['A', '7', '1', 'GS', '10'])).toEqual(['1', '7', '10', 'A', 'GS']);
    });

    test('deduplicates and keeps X-suffixed routes next to their base', () => {
        expect(sortRoutes(['6', '6X', '6'])).toEqual(['6', '6X']);
        expect(routeSortKey('6') < routeSortKey('6X')).toBe(true);
    });
});

describe('eta formatting', () => {
    test('past and imminent arrivals read as now', () => {
        expect(formatEta(NOW - 120, NOW)).toBe('now');
        expect(formatEta(NOW + 10, NOW)).toBe('now');
    });

    test('minutes round to the nearest minute', () => {
        expect(formatEta(NOW + 90, NOW)).toBe('2 min');
        expect(formatEta(NOW + 150, NOW)).toBe('3 min');
    });

    test('missing times are a dash', () => {
        expect(formatEta(null, NOW)).toBe('—');
        expect(formatEta(Number.NaN, NOW)).toBe('—');
    });
});

describe('speed formatting', () => {
    test('stopped below walking pace', () => {
        expect(formatSpeed(0)).toBe('stopped');
        expect(formatSpeed(0.4)).toBe('stopped');
        expect(formatSpeed(null)).toBe('stopped');
    });

    test('metres per second become mph', () => {
        expect(formatSpeed(10)).toBe('22 mph');
    });
});

describe('feed health', () => {
    test('labels are the route groups, not the feed ids', () => {
        expect(feedLabel('gtfs-nqrw')).toBe('NQRW');
        expect(feedLabel('subway-alerts')).toBe('alerts');
        expect(feedLabel('something-else')).toBe('something-else');
    });

    test('tone reflects failure and staleness', () => {
        expect(feedTone(feed())).toBe('ok');
        expect(feedTone(feed({ age_s: 300 }))).toBe('warn');
        expect(feedTone(feed({ ok: false, error: 'http 500' }))).toBe('bad');
    });
});

describe('small formatters', () => {
    test('status labels', () => {
        expect(statusLabel('STOPPED_AT')).toBe('at platform');
        expect(statusLabel('IN_TRANSIT_TO')).toBe('in transit');
        expect(statusLabel(null)).toBe('unknown');
    });

    test('ages', () => {
        expect(formatAge(12)).toBe('12s');
        expect(formatAge(120)).toBe('2m');
        expect(formatAge(7200)).toBe('2h');
        expect(formatAge(null)).toBe('unknown');
    });

    test('confidence clamps and rounds', () => {
        expect(formatConfidence(0.945)).toBe('95%');
        expect(formatConfidence(1.4)).toBe('100%');
        expect(formatConfidence(-1)).toBe('0%');
    });
});
