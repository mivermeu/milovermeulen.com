import { describe, expect, it } from 'bun:test';
import {
    ACCURACY_SOFT_LIMIT_MS,
    DEFAULT_SIM_SPEED,
    REALTIME_SNAP_MS,
    SCRUB_RANGE_MS,
    SCRUB_SLIDER_STEPS,
    SCRUB_LOG_K,
    SIM_SPEEDS,
    clampSimEpoch,
    epochAction,
    nextPropagateEpoch,
    scrubOffsetMsToSlider,
    scrubSliderToOffsetMs,
    simAccuracy,
    stepSimClock
} from './simclock';

const NOW = 1_000_000_000_000; // fixed real-time anchor (ms)
const DAY = 24 * 60 * 60 * 1000;

describe('clampSimEpoch', () => {
    it('passes through epochs inside the scrub window', () => {
        expect(clampSimEpoch(NOW, NOW)).toBe(NOW);
        expect(clampSimEpoch(NOW + DAY, NOW)).toBe(NOW + DAY);
        expect(clampSimEpoch(NOW - DAY, NOW)).toBe(NOW - DAY);
    });

    it('clamps to ±30 days around the real-time anchor', () => {
        expect(clampSimEpoch(NOW + 300 * DAY, NOW)).toBe(NOW + SCRUB_RANGE_MS);
        expect(clampSimEpoch(NOW - 300 * DAY, NOW)).toBe(NOW - SCRUB_RANGE_MS);
    });

    it('anchors the window to the given real now, not module time', () => {
        // A +30d epoch is legal earlier but out of bounds w.r.t. an earlier real now.
        expect(clampSimEpoch(NOW, NOW - SCRUB_RANGE_MS - DAY)).toBe(
            NOW - SCRUB_RANGE_MS - DAY + SCRUB_RANGE_MS
        );
    });
});

describe('stepSimClock', () => {
    it('at 1× advances by elapsed real time', () => {
        expect(stepSimClock(NOW, 100, 1, NOW + 100)).toBe(NOW + 100);
    });

    it('speed multiplies elapsed real time', () => {
        expect(stepSimClock(NOW, 100, 60, NOW + 100)).toBe(NOW + 6000);
        expect(stepSimClock(NOW, 100, 600, NOW + 100)).toBe(NOW + 60000);
    });

    it('keeps a paused clock still (zero elapsed advances nothing)', () => {
        expect(stepSimClock(NOW, 0, 600, NOW)).toBe(NOW);
    });

    it('follows a monotonic clock across ticks', () => {
        let sim = NOW;
        for (let i = 1; i <= 5; i++) sim = stepSimClock(sim, 50, 10, NOW + i * 50);
        expect(sim).toBe(NOW + 5 * 500);
    });

    it('never leaves the ±30d scrub window while playing forward', () => {
        let sim = NOW + SCRUB_RANGE_MS - 10;
        // 600× for a long stretch would blow past the window without the clamp.
        sim = stepSimClock(sim, 10_000, 600, NOW + 10_000);
        expect(sim).toBe(NOW + SCRUB_RANGE_MS + 10_000);
    });

    it('drops back into the window when the anchor moves under a parked epoch', () => {
        // Parked at +30d of the old anchor; real time later passes the parked epoch…
        const parked = NOW + SCRUB_RANGE_MS;
        const later = parked + 5 * DAY;
        // …but the parked epoch stays inside the sliding window, so it advances.
        expect(stepSimClock(parked, 100, 10, later)).toBe(parked + 100 * 10);
    });
});

describe('nextPropagateEpoch', () => {
    it('stamps the future-of-cadence lead relative to simulated time', () => {
        expect(nextPropagateEpoch(NOW, 600)).toBe(NOW + 600);
    });

    it('scales the lead with the simulated clock, not wall clock', () => {
        // Lead constant (cadence·speed); the caller supplies the simulate epoch.
        expect(nextPropagateEpoch(NOW + 3600, 720_000)).toBe(NOW + 3600 + 720_000);
    });

    it('keeps requests monotonic while the simulated clock is paused', () => {
        // Repeated ticks at a frozen sim epoch stamp the same epoch.
        const stamp = nextPropagateEpoch(NOW, 600);
        expect(nextPropagateEpoch(NOW, 600)).toBe(stamp);
    });

    it('follows a scrub backward — monotonicity is intentionally broken there', () => {
        const before = nextPropagateEpoch(NOW + 10 * DAY, 600);
        const after = nextPropagateEpoch(NOW - 10 * DAY, 600);
        expect(after).toBeLessThan(before);
    });
});

describe('epochAction', () => {
    const LEAD = 600; // expected normal advance (cadence·speed)

    it('blends routine forward advances', () => {
        expect(epochAction(1000, 1600, LEAD)).toBe('blend');
    });

    it('blends throttled gaps under the floor', () => {
        expect(epochAction(1000, 25_000, LEAD)).toBe('blend');
    });

    it('snaps on large forward jumps (scrub ahead)', () => {
        expect(epochAction(1000, 3 * DAY, LEAD)).toBe('snap');
    });

    it('snaps on backwards epochs (scrub reverse)', () => {
        expect(epochAction(1000 + DAY, 1000, LEAD)).toBe('snap');
    });

    it('drops same-epoch duplicates (paused clock)', () => {
        expect(epochAction(1000, 1000, LEAD)).toBe('drop');
    });

    it('snaps past throttle-sized forward gaps too (far beyond the floor)', () => {
        expect(epochAction(0, 90_000, LEAD)).toBe('snap');
        expect(epochAction(0, 29_999, LEAD)).toBe('blend');
        expect(epochAction(0, 30_001, LEAD)).toBe('snap');
    });

    it('graceful for expected advances at high speeds', () => {
        // Max cadence (600 ms) × max speed (600×) = 6 min of simulated time.
        const maxAdvance = 600 * 600;
        expect(epochAction(1000, 1000 + maxAdvance, maxAdvance)).toBe('blend');
    });
});

describe('simAccuracy', () => {
    it('is live inside the ~2 day TLE band', () => {
        expect(simAccuracy(0)).toBe('live');
        expect(simAccuracy(ACCURACY_SOFT_LIMIT_MS)).toBe('live');
        expect(simAccuracy(-ACCURACY_SOFT_LIMIT_MS)).toBe('live');
    });

    it('flags degrading accuracy beyond the band', () => {
        expect(simAccuracy(ACCURACY_SOFT_LIMIT_MS + 1)).toBe('degrading');
        expect(simAccuracy(-10 * DAY)).toBe('degrading');
    });
});

describe('constants', () => {
    it('defaults to exact real-time behavior', () => {
        expect(DEFAULT_SIM_SPEED).toBe(1);
        expect(SIM_SPEEDS).toEqual([1, 10, 60, 600]);
    });

    it('scrub window is ±30 days', () => {
        expect(SCRUB_RANGE_MS).toBe(30 * DAY);
    });
});

describe('symmetric-log scrub mapping', () => {
    const sliderFromOffset = (ms: number) => scrubOffsetMsToSlider(ms);
    const offsetFromSlider = (pos: number) => scrubSliderToOffsetMs(pos);

    it('maps the center to zero and the ends to ±30 days', () => {
        expect(offsetFromSlider(SCRUB_SLIDER_STEPS / 2)).toBe(0);
        expect(offsetFromSlider(0)).toBe(-SCRUB_RANGE_MS);
        expect(offsetFromSlider(SCRUB_SLIDER_STEPS)).toBe(SCRUB_RANGE_MS);
    });

    it('is monotonic across the sweep', () => {
        let last = -Infinity;
        for (let p = 0; p <= SCRUB_SLIDER_STEPS; p += 1) {
            const offset = offsetFromSlider(p);
            expect(offset).toBeGreaterThan(last);
            last = offset;
        }
    });

    it('round-trips through the inverse', () => {
        for (const p of [0, 250, SCRUB_SLIDER_STEPS / 2, 1750, SCRUB_SLIDER_STEPS]) {
            expect(sliderFromOffset(offsetFromSlider(p))).toBeCloseTo(p, 6);
        }
        for (const ms of [
            -30 * DAY,
            -2 * DAY,
            -90 * 60_000,
            -30_000,
            -1,
            1,
            95 * 60_000,
            30 * DAY
        ]) {
            expect(offsetFromSlider(sliderFromOffset(ms))).toBeCloseTo(ms, -4);
        }
    });

    it('resolves sub-second steps at the center (LEO-scale nudging)', () => {
        // One step away from center must be close to the advertised ~0.2 s.
        const oneStepMs = offsetFromSlider(SCRUB_SLIDER_STEPS / 2 + 1);
        expect(Math.abs(oneStepMs)).toBeGreaterThan(100);
        expect(Math.abs(oneStepMs)).toBeLessThan(REALTIME_SNAP_MS);
        // And a quarter sweep lands near a LEO period (~95 min).
        const quarter = offsetFromSlider(SCRUB_SLIDER_STEPS * 0.75);
        expect(Math.abs(quarter)).toBeGreaterThan(60 * 60_000);
        expect(Math.abs(quarter)).toBeLessThan(2 * 60 * 60_000);
    });

    it('clamps out-of-domain inputs', () => {
        expect(offsetFromSlider(-50)).toBe(-SCRUB_RANGE_MS);
        expect(offsetFromSlider(SCRUB_SLIDER_STEPS + 50)).toBe(SCRUB_RANGE_MS);
        expect(sliderFromOffset(-SCRUB_RANGE_MS * 10)).toBe(0);
        expect(sliderFromOffset(SCRUB_RANGE_MS * 10)).toBe(SCRUB_SLIDER_STEPS);
    });

    it('centering constants stay in sync with the mapping claims', () => {
        // CENTER STEP ≈ SCRUB_RANGE_MS · K/(e^K−1) · (2/STEPS) — keep these
        // roughly consistent so documentation and tests stay truthful.
        expect(SCRUB_SLIDER_STEPS).toBeGreaterThan(1000);
        expect(SCRUB_LOG_K).toBeGreaterThan(8);
    });
});
