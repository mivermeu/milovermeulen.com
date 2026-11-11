/**
 * Data for the selected train's progress chart.
 *
 * Two series share one time axis:
 *
 * * the train's own path — observed for the last few minutes, projected from the
 *   server timeline for the next fifteen;
 * * a historical p10-p90 band built from per-edge travel-time quantiles for the
 *   pattern. Each edge interval is widened from its own run-time spread, so the
 *   band is a stringline envelope rather than a sample of individual runs. That
 *   is far more stable than aligning whole trajectories, which mixes arriving,
 *   dwelling and departing trains at the same distance.
 *
 * Everything is in metres along the pattern relative to the current position,
 * so the chart does not need to know which stop the train is near to be read.
 */

import { timelineAt } from './sim';
import type { PatternGeometry, PatternHistory, TrainMotion } from './types';

export const LOOKBACK_S = 300;
export const HORIZON_S = 900;
export const STEP_S = 15;

export interface ChartPoint {
    /** Seconds from now; negative is observed history. */
    x: number;
    /** Metres along the pattern relative to the current position. */
    ds: number;
    /** Metres per second. */
    v: number;
}

export interface ChartBandPoint {
    x: number;
    low: number;
    median: number;
    high: number;
    vLow: number;
    vMedian: number;
    vHigh: number;
}

export interface ChartStop {
    x: number;
    ds: number;
    stop: string;
}

export interface ProgressChartData {
    past: ChartPoint[];
    projection: ChartPoint[];
    band: ChartBandPoint[];
    stops: ChartStop[];
    minDs: number;
    maxDs: number;
    velMax: number;
    /** Runs behind the edge quantiles. */
    runCount: number;
    hasProjection: boolean;
    hasHistory: boolean;
}

const NY = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
    weekday: 'short'
});

/** Local hour and weekday/weekend in New York, where the service runs. */
export function newYorkClock(now: number): { hour: number; weekend: boolean } {
    const parts = NY.formatToParts(new Date(now * 1000));
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0') % 24;
    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon';
    return { hour, weekend: weekday === 'Sat' || weekday === 'Sun' };
}

/** Distance along the pattern at absolute time `t`, from a stop-time envelope. */
function distanceAt(
    t: number,
    now: number,
    base: number,
    times: number[],
    distances: number[]
): number {
    if (t <= now) return base;
    let previousTime = now;
    let previousDistance = base;
    for (let index = 0; index < times.length; index += 1) {
        const span = times[index] - previousTime;
        if (t <= times[index]) {
            if (span <= 0) return distances[index];
            const fraction = (t - previousTime) / span;
            return previousDistance + (distances[index] - previousDistance) * fraction;
        }
        previousTime = times[index];
        previousDistance = distances[index];
    }
    return previousDistance;
}

/**
 * Turn per-edge [p10, p50, p90] travel times into a distance band.
 *
 * The current edge's total time is reduced by the phase already elapsed, so the
 * first arrival is the remaining time from now; later edges add their full
 * time. The band is expressed relative to the train's current distance.
 */
function buildEdgeBand(
    motion: TrainMotion,
    geometry: PatternGeometry,
    edges: (number[] | null)[],
    dwells: number[],
    now: number
): ChartBandPoint[] {
    const stops = geometry.stops;
    const startEdge = Math.min(Math.max(motion.edge, 0), Math.max(0, stops.length - 2));
    // Negative while dwelling: the time still to wait at the platform.
    const phase = motion.departAt !== null ? now - motion.departAt : 0;
    const arrivalTimes: [number[], number[], number[]] = [[], [], []];
    const distances: [number[], number[], number[]] = [[], [], []];
    const cursors = [now, now, now];
    const base = motion.sTotal;
    if (phase < 0) {
        for (let quantile = 0; quantile < 3; quantile += 1) {
            cursors[quantile] += -phase;
            arrivalTimes[quantile].push(cursors[quantile]);
            distances[quantile].push(base);
        }
    }
    for (let index = startEdge + 1; index < stops.length && index <= startEdge + 12; index += 1) {
        const row = edges[index - 1];
        if (!row || row.length < 3) break;
        for (let quantile = 0; quantile < 3; quantile += 1) {
            const total = row[quantile];
            const remaining =
                index === startEdge + 1 && phase >= 0 ? Math.max(0, total - phase) : total;
            cursors[quantile] += remaining;
            arrivalTimes[quantile].push(cursors[quantile]);
            distances[quantile].push(stops[index].dist);
            const dwell = dwells[index] ?? 0;
            if (dwell > 0) {
                cursors[quantile] += dwell;
                arrivalTimes[quantile].push(cursors[quantile]);
                distances[quantile].push(stops[index].dist);
            }
        }
    }
    if (arrivalTimes[0].length === 0) return [];

    const band: ChartBandPoint[] = [];
    for (let x = 0; x <= HORIZON_S; x += STEP_S) {
        const at = now + x;
        const distance = [
            distanceAt(at, now, base, arrivalTimes[0], distances[0]),
            distanceAt(at, now, base, arrivalTimes[1], distances[1]),
            distanceAt(at, now, base, arrivalTimes[2], distances[2])
        ];
        const later = [
            distanceAt(at + STEP_S, now, base, arrivalTimes[0], distances[0]),
            distanceAt(at + STEP_S, now, base, arrivalTimes[1], distances[1]),
            distanceAt(at + STEP_S, now, base, arrivalTimes[2], distances[2])
        ];
        const speed = later.map((value, index) => (value - distance[index]) / STEP_S);
        // The p10 edge time is the fast line: it is furthest ahead, so it is the
        // upper bound of the distance band even though it is the low quantile.
        band.push({
            x,
            low: Math.min(distance[0], distance[2]) - base,
            median: distance[1] - base,
            high: Math.max(distance[0], distance[2]) - base,
            vLow: Math.min(speed[0], speed[2]),
            vMedian: speed[1],
            vHigh: Math.max(speed[0], speed[2])
        });
    }
    return band;
}

function samplePast(
    past: { t: number; s: number; v: number }[],
    t: number
): { s: number; v: number } | null {
    if (past.length === 0) return null;
    if (t < past[0].t || t > past[past.length - 1].t) return null;
    for (let index = 1; index < past.length; index += 1) {
        const previous = past[index - 1];
        const current = past[index];
        if (t <= current.t) {
            const span = current.t - previous.t;
            const fraction = span > 0 ? (t - previous.t) / span : 0;
            return {
                s: previous.s + (current.s - previous.s) * fraction,
                v: previous.v + (current.v - previous.v) * fraction
            };
        }
    }
    return { s: past[past.length - 1].s, v: past[past.length - 1].v };
}

export function buildProgressChart(
    motion: TrainMotion,
    geometry: PatternGeometry,
    history: PatternHistory | null,
    now: number,
    past: { t: number; s: number; v: number }[]
): ProgressChartData {
    const base = motion.sTotal;
    const pastPoints: ChartPoint[] = [];
    for (let x = -LOOKBACK_S; x <= 0; x += STEP_S) {
        const sample = samplePast(past, now + x);
        if (sample) pastPoints.push({ x, ds: sample.s - base, v: sample.v });
    }

    const projection: ChartPoint[] = [];
    for (let x = 0; x <= HORIZON_S; x += STEP_S) {
        const sample = timelineAt(motion, geometry, now + x);
        // At x = 0 the chart starts at the dot the user can see, not at the
        // timeline's unfiltered value; they differ by the current easing error.
        projection.push({ x, ds: x === 0 ? 0 : sample.sTotal - base, v: sample.v });
    }

    const weekend = newYorkClock(now).weekend;
    const table =
        (weekend ? history?.edges?.weekend : history?.edges?.weekday) ?? history?.edges?.all ?? [];
    const band = buildEdgeBand(motion, geometry, table, history?.dwells ?? [], now);

    const stops: ChartStop[] = [];
    for (let index = 0; index < motion.next.length; index += 1) {
        const stop = motion.next[index];
        if (stop.arr === null || !Number.isFinite(stop.arr)) continue;
        const x = stop.arr - now;
        if (x < 0 || x > HORIZON_S) continue;
        const row = geometry.stops[motion.edge + 1 + index];
        if (!row) continue;
        stops.push({ x, ds: row.dist - base, stop: stop.stop ?? '' });
    }

    const distances = [
        ...projection.map((point) => point.ds),
        ...pastPoints.map((point) => point.ds),
        ...band.flatMap((point) => [point.low, point.high])
    ];
    let minDs = distances.length ? Math.min(...distances) : -500;
    let maxDs = distances.length ? Math.max(...distances) : 500;
    const pad = Math.max(80, (maxDs - minDs) * 0.1);
    minDs -= pad;
    maxDs += pad;
    if (maxDs - minDs < 400) {
        const middle = (minDs + maxDs) / 2;
        minDs = middle - 200;
        maxDs = middle + 200;
    }

    const speeds = [
        ...projection.map((point) => point.v),
        ...pastPoints.map((point) => point.v),
        ...band.map((point) => point.vHigh)
    ];
    const topSpeed = speeds.length ? Math.max(...speeds) : 10;
    const velMax = Math.min(25, Math.max(10, Math.ceil((topSpeed * 1.15) / 5) * 5));

    return {
        past: pastPoints,
        projection,
        band,
        stops,
        minDs,
        maxDs,
        velMax,
        runCount: history?.runs?.length ?? 0,
        hasProjection: projection.length >= 2,
        hasHistory: band.length >= 2
    };
}
