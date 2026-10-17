/** Pure simulated-time primitives. One shared clock drives both globe and graph. */

/** Scrub domain: ±30 days around real time. */
export const SCRUB_RANGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Slider steps across the full sweep; symmetric-log mapping gives sub-second center resolution. */
export const SCRUB_SLIDER_STEPS = 2000;
/** Scrub mapping steepness: more travel near center (~0.2 s/step, LEO period ~quarter sweep). */
export const SCRUB_LOG_K = 12;

/** Slider position (0..SCRUB_SLIDER_STEPS) → clock offset from real time. */
export function scrubSliderToOffsetMs(position: number): number {
    const u = Math.min(1, Math.max(0, position / SCRUB_SLIDER_STEPS)) * 2 - 1; // [−1, 1]
    const a = Math.abs(u);
    return (
        (Math.sign(u) * SCRUB_RANGE_MS * (Math.exp(SCRUB_LOG_K * a) - 1)) /
        (Math.exp(SCRUB_LOG_K) - 1)
    );
}

/** Inverse of `scrubSliderToOffsetMs`, clamped to the slider domain. */
export function scrubOffsetMsToSlider(offsetMs: number): number {
    const a = Math.abs(offsetMs) / SCRUB_RANGE_MS;
    const u =
        Math.sign(offsetMs) *
        Math.min(1, Math.max(0, Math.log1p(a * (Math.exp(SCRUB_LOG_K) - 1))) / SCRUB_LOG_K);
    return ((u + 1) / 2) * SCRUB_SLIDER_STEPS;
}

/** Offsets within 0.5 s of now count as live: snap re-engages real time. */
export const REALTIME_SNAP_MS = 500;
/** Past ~2 days SGP4 accuracy degrades, so the UI flags the readout. */
export const ACCURACY_SOFT_LIMIT_MS = 2 * 24 * 60 * 60 * 1000;

export const SIM_SPEEDS = [1, 10, 60, 600] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];
export const DEFAULT_SIM_SPEED: SimSpeed = 1;

export function simAccuracy(offsetMs: number): 'live' | 'degrading' {
    return Math.abs(offsetMs) > ACCURACY_SOFT_LIMIT_MS ? 'degrading' : 'live';
}

/** Clamp a simulated epoch into the ±30d window so sim time never leaves TLE credibility. */
export function clampSimEpoch(simEpochMs: number, realNowMs: number): number {
    if (!Number.isFinite(simEpochMs)) return realNowMs;
    if (simEpochMs < realNowMs - SCRUB_RANGE_MS) return realNowMs - SCRUB_RANGE_MS;
    if (simEpochMs > realNowMs + SCRUB_RANGE_MS) return realNowMs + SCRUB_RANGE_MS;
    return simEpochMs;
}

/** Advance the epoch by elapsed real time × speed, clamped to the scrub window. */
export function stepSimClock(
    simEpochMs: number,
    elapsedRealMs: number,
    speed: number,
    realNowMs: number
): number {
    const advanced = simEpochMs + Math.max(0, elapsedRealMs) * speed;
    if (!Number.isFinite(advanced)) return realNowMs;
    return clampSimEpoch(advanced, realNowMs);
}

/** Next `propagate` stamp: sim now + lead. Stamps stay monotonic while sim time is; scrubs break it (see `epochAction`). */
export function nextPropagateEpoch(simEpochMs: number, leadMs: number): number {
    if (!Number.isFinite(simEpochMs) || !Number.isFinite(leadMs)) return Date.now();
    return Math.round(simEpochMs + leadMs);
}

/** Dead-reckon allowance past the newest snapshot, in snapshot intervals. */
export const DEAD_RECKON_EXTRA = 0.5;

/** Blend factor for a snapshot pair at `simEpoch`; past the newest snapshot it dead-reckons up to 1 + DEAD_RECKON_EXTRA. */
export function renderBlend(prevEpoch: number, nextEpoch: number, simEpoch: number): number {
    if (!Number.isFinite(simEpoch)) return 1;
    const span = nextEpoch - prevEpoch;
    if (!(span > 0)) return 1;
    const blend = (simEpoch - prevEpoch) / span;
    if (blend <= 0) return 0;
    const cap = 1 + DEAD_RECKON_EXTRA;
    return blend > cap ? cap : blend;
}

/** Snapshot decision keyed on regime revision (epoch equality alone can't tell "same data" from "new regime"). */
export type EpochAction = 'blend' | 'snap' | 'drop';
/** Forward gap above this floor is a clock jump (scrub), not routine cadence. */
const SNAP_FLOOR_MS = 30_000;
/** Gaps below this multiple of the expected advance glide across (covers worker stalls). */
const BLEND_TOLERANCE_MULTIPLE = 6;

/** Continuity guard: blend routine advances, snap backwards/jumps, drop duplicates. */
export function epochAction(
    nextEpoch: number,
    incomingEpoch: number,
    expectedAdvanceMs: number
): EpochAction {
    const delta = incomingEpoch - nextEpoch;
    if (!Number.isFinite(delta) || !Number.isFinite(expectedAdvanceMs)) return 'drop';
    if (delta === 0) return 'drop';
    if (delta < 0) return 'snap';
    return delta > Math.max(expectedAdvanceMs * BLEND_TOLERANCE_MULTIPLE, SNAP_FLOOR_MS)
        ? 'snap'
        : 'blend';
}
