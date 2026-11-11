/**
 * Data for the selected train's progress chart.
 *
 * Two series share one time axis:
 *
 * * the train's own path — observed for the last few minutes, projected from the
 *   server timeline for the next fifteen;
 * * a historical p10-p90 band built from recent runs of the same pattern,
 *   filtered to a similar time of day and aligned at the train's current
 *   distance. That alignment is the useful part: "trains that were here at this
 *   time usually get there in 4-6 minutes".
 *
 * Everything is in metres along the pattern relative to the current position,
 * so the chart does not need to know which stop the train is near to be read.
 */

import { timelineAt } from './sim';
import type { PatternGeometry, PatternHistory, HistoryRun, TrainMotion } from './types';

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
    /** Comparable runs that covered the current position. */
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

function hourDistance(a: number, b: number): number {
    const diff = Math.abs(a - b) % 24;
    return Math.min(diff, 24 - diff);
}

function quantile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const position = (sorted.length - 1) * p;
    const low = Math.floor(position);
    const high = Math.ceil(position);
    if (low === high) return sorted[low];
    return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

/** Linear sample of one historical run at absolute time `t`. */
export function sampleRun(run: HistoryRun, t: number): { s: number; v: number } | null {
    const values = run.s;
    if (values.length === 0 || run.dt <= 0) return null;
    const position = (t - run.start) / run.dt;
    if (position < 0 || position > values.length - 1) return null;
    const index = Math.floor(position);
    const fraction = position - index;
    if (index >= values.length - 1) return { s: values[values.length - 1], v: 0 };
    const current = values[index];
    const next = values[index + 1];
    const before = values[Math.max(0, index - 1)];
    const after = values[Math.min(values.length - 1, index + 2)];
    return {
        s: current + (next - current) * fraction,
        v: Math.max(0, (after - before) / (2 * run.dt))
    };
}

/** First time the run reached `target` metres, interpolated between samples. */
export function crossTime(run: HistoryRun, target: number): number | null {
    const values = run.s;
    if (values.length < 2 || run.dt <= 0) return null;
    if (target < values[0] || target > values[values.length - 1]) return null;
    for (let index = 1; index < values.length; index += 1) {
        const previous = values[index - 1];
        const current = values[index];
        if (previous < target && current >= target) {
            const fraction = current > previous ? (target - previous) / (current - previous) : 0;
            return run.start + (index - 1 + fraction) * run.dt;
        }
    }
    return run.start;
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

/** Runs that share day type and roughly the hour; widen when the pool is thin. */
export function selectRuns(history: PatternHistory | null, now: number): HistoryRun[] {
    if (!history || history.runs.length === 0) return [];
    const { hour, weekend } = newYorkClock(now);
    const sameType = history.runs.filter((run) => run.w === (weekend ? 1 : 0));
    let pool = sameType.filter((run) => hourDistance(run.h, hour) <= 2);
    if (pool.length < 6) pool = sameType;
    if (pool.length < 3) pool = history.runs;
    return pool;
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

    const runs = selectRuns(history, now);
    const aligned = runs
        .map((run) => ({ run, tCross: crossTime(run, base) }))
        .filter((entry): entry is { run: HistoryRun; tCross: number } => entry.tCross !== null);

    const band: ChartBandPoint[] = [];
    for (let x = -LOOKBACK_S; x <= HORIZON_S; x += STEP_S) {
        const distances: number[] = [];
        const speeds: number[] = [];
        for (const { run, tCross } of aligned) {
            const sample = sampleRun(run, tCross + x);
            if (!sample) continue;
            distances.push(sample.s - base);
            speeds.push(sample.v);
        }
        if (distances.length < 5) continue;
        distances.sort((a, b) => a - b);
        speeds.sort((a, b) => a - b);
        band.push({
            x,
            low: quantile(distances, 0.1),
            median: quantile(distances, 0.5),
            high: quantile(distances, 0.9),
            vLow: quantile(speeds, 0.1),
            vMedian: quantile(speeds, 0.5),
            vHigh: quantile(speeds, 0.9)
        });
    }

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
        runCount: aligned.length,
        hasProjection: projection.length >= 2,
        hasHistory: band.length >= 2
    };
}
