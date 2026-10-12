/**
 * Pure simulated-time primitives for the tracker. Everything here is a pure
 * function of explicit arguments so the clock math and the snapshot-continuity
 * decisions are unit-testable without DOM, RAF intervals, or the propagation
 * service.
 *
 * One shared simulated clock (`trackerState.simEpochMs`) drives both the globe
 * and the orbital-parameter graph — never let a view keep its own notion of
 * "now".
 */

/** Scrub domain: ±30 days around real time. */
export const SCRUB_RANGE_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * Scrub slider granularity: integer steps across the full sweep. Combined with
 * the symmetric-log mapping below this puts sub-second resolution at the
 * slider's center and ±30 days at its ends.
 */
export const SCRUB_SLIDER_STEPS = 2000;
/**
 * Steepness of the symmetric-log scrub mapping. Higher K concentrates more of
 * the slider travel near the center: at K=12 a single step moves the clock
 * ~0.2 s, a full LEO period (~95 min) sits about a quarter sweep out, and the
 * ends still reach ±30 days.
 */
export const SCRUB_LOG_K = 12;

/**
 * Map a scrub-slider position (`0..SCRUB_SLIDER_STEPS`) to a clock offset from
 * real time. Symmetric-exponential around the center so fine control lands at
 * small offsets (LEO orbital dynamics evolve over minutes) while the whole
 * ±30-day window stays one sweep away.
 */
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

/**
 * Offsets within half a second of real time count as "on the live feed": the
 * scrub-to-center snap and a pause/play round-trip at Now re-engage real time
 * instead of leaving a useless ±0.3 s simulated offset behind.
 */
export const REALTIME_SNAP_MS = 500;
/**
 * TLEs are published near-epoch; beyond ~2 days of extrapolation SGP4 accuracy
 * degrades quickly, so the UI flags the readout past this offset.
 */
export const ACCURACY_SOFT_LIMIT_MS = 2 * 24 * 60 * 60 * 1000;

export const SIM_SPEEDS = [1, 10, 60, 600] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];
export const DEFAULT_SIM_SPEED: SimSpeed = 1;

/** Simulated epochs in the "degrading accuracy" band. */
export function simAccuracy(offsetMs: number): 'live' | 'degrading' {
    return Math.abs(offsetMs) > ACCURACY_SOFT_LIMIT_MS ? 'degrading' : 'live';
}

/**
 * Clamp a simulated epoch into the ±30d scrub window around `realNowMs`.
 * Applies to scrubbing, stepping, and resets so sim time can never wander
 * outside TLE credibility.
 */
export function clampSimEpoch(simEpochMs: number, realNowMs: number): number {
    if (simEpochMs < realNowMs - SCRUB_RANGE_MS) return realNowMs - SCRUB_RANGE_MS;
    if (simEpochMs > realNowMs + SCRUB_RANGE_MS) return realNowMs + SCRUB_RANGE_MS;
    return simEpochMs;
}

/**
 * One clock tick: advance the simulated epoch by `elapsedRealMs` of real time
 * at `speed`×, clamped to the scrub window around `realNowMs`. While paused the
 * caller simply does not call this — nothing else changes.
 */
export function stepSimClock(
    simEpochMs: number,
    elapsedRealMs: number,
    speed: number,
    realNowMs: number
): number {
    const advanced = simEpochMs + elapsedRealMs * speed;
    return clampSimEpoch(advanced, realNowMs);
}

/**
 * The propagation stamp for the next `propagate` request: simulated now plus
 * the future-of-cadence lead, so the newest snapshot sits ahead of the clock
 * and both views blend into a fresh endpoint. Because the lead tracks the
 * simulated clock itself, stamps stay monotonic exactly while simulated time is
 * monotonic — a scrub deliberately breaks that, and the views detect it via
 * `epochAction` below.
 */
export function nextPropagateEpoch(simEpochMs: number, leadMs: number): number {
    return Math.round(simEpochMs + leadMs);
}

/**
 * How far past the newest snapshot a view may dead-reckon, in snapshot
 * intervals. Worker responses arrive on a real-time cadence while the
 * simulated clock runs unthrottled, so at high speeds the clock can spend part
 * of an interval waiting for the next response — holding still until it lands
 * reads as stutter, while gliding along the pair's own velocity is visually
 * exact right past the pair end. The extra allowance is deliberately *small*
 * — half an interval: a satellite's track curves ~4.5° per interval, so far
 * extrapolation drifts quadratically off the arc and reads as a jump when the
 * next snapshot lands.
 */
export const DEAD_RECKON_EXTRA = 0.5;

/**
 * Per-frame blend factor for a snapshot pair at `simEpoch`. Returns 0 before
 * the pair window, the linear blend inside it — and beyond the newest snapshot
 * continues past 1 (dead reckoning along the pair's implied velocity), clamped
 * at `1 + DEAD_RECKON_EXTRA`. Paired with `blendInto`, whose linear/angle
 * interpolation is well-behaved for any factor.
 */
export function renderBlend(prevEpoch: number, nextEpoch: number, simEpoch: number): number {
    const span = nextEpoch - prevEpoch;
    if (!(span > 0)) return 1; // degenerate pair (fresh regime): hold the newest
    const blend = (simEpoch - prevEpoch) / span;
    if (blend <= 0) return 0;
    const cap = 1 + DEAD_RECKON_EXTRA;
    return blend > cap ? cap : blend;
}

/** What a view should do with an incoming snapshot.
 *
 * Views key on the propagation service's *regime revision* (stamped onto
 * every request and echoed on responses): a paused clock stamps the same epoch
 * forever, so epoch equality alone can't tell "same data" from "new regime,
 * fresh data" — the revision can. The service raises it on catalog init and
 * element-mode switches, and the user-scrub entry point in state.svelte.ts
 * flags scrubs (`simScrubSeq`), which the service promotes to revision bumps so
 * an actual scrub snaps instead of blending by magnitude.
 */
export type EpochAction = 'blend' | 'snap' | 'drop';
/**
 * Floor above which a forward epoch gap is a clock jump (scrub) rather than
 * routine snapshot cadence — normal advances are ≤ cadence·speed (≤ 6 min here,
 * but a hidden-tab throttle can legitimately produce seconds).
 */
const SNAP_FLOOR_MS = 30_000;
/**
 * Forward gaps between the routine advance and a genuine clock jump snap only
 * beyond this multiple of the expected advance. Everything below it — including
 * a response stretched by a worker stall of several intervals — glides across,
 * because the gap is still real, continuous motion along the same track and a
 * catch-up glide looks far better than a teleport.
 */
const BLEND_TOLERANCE_MULTIPLE = 6;

/**
 * Continuity guard comparing an incoming snapshot's epoch against the epoch of
 * the snapshot a view currently holds forward.
 *
 * - 'blend': routine forward advance — glide between the endpoints. Stretches
 *   from a slow worker (a few intervals) also blend: a fast catch-up glide
 *   across real, continuous motion beats a teleport.
 * - 'snap' : backwards or discontinuous simulated epoch — replace the pair
 *   outright, never interpolate across a time jump. User scrubs reach the views
 *   as explicit regime-revision bumps and take this path directly; the
 *   magnitude screen below stays as backstop for gaps no flag can see
 *   (reversed scrubs, hidden-tab throttling, stale in-flight responses).
 * - 'drop' : same simulated epoch as the held snapshot (paused clock) — data is
 *   identical unless the regime revision changed (checked before this guard in
 *   the views), so skip the work; the render stays static with span ≈ 0.
 */
export function epochAction(
    nextEpoch: number,
    incomingEpoch: number,
    expectedAdvanceMs: number
): EpochAction {
    const delta = incomingEpoch - nextEpoch;
    if (delta === 0) return 'drop';
    if (delta < 0) return 'snap';
    return delta > Math.max(expectedAdvanceMs * BLEND_TOLERANCE_MULTIPLE, SNAP_FLOOR_MS)
        ? 'snap'
        : 'blend';
}
