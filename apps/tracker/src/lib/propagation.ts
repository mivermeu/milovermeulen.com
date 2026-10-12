import type { ParsedSatellite } from '$lib/satellites/types';
import { nextPropagateEpoch } from './simclock';
import { trackerState } from './state.svelte';
import type { ElementMode } from './orbit';

export type { ElementMode };

export interface WorkerResponse {
    type: string;
    requestId?: number;
    count?: number;
    epoch?: number;
    /** Worker-side catalog version; bumped on every init so views can drop stale snapshots. */
    generation?: number;
    /**
     * Service-side data-regime version (bumped on init and element-mode switch),
     * echoed from the propagate request; a view holding an older revision must
     * snap to the new data instead of blending across the switch.
     */
    revision?: number;
    colors?: Float32Array;
    positions?: Float32Array;
    elements?: Float32Array;
    message?: string;
    ranges?: number[];
}

/**
 * Blend the `prev -> next` snapshots into `current` (`stride` floats per item).
 * Channels named in `angleOffsets` are degrees wrapped to [0, 360), so they
 * blend along the shortest arc — a 359°→0° wrap never drags a point halfway
 * across the chart. A NaN endpoint means "unknown" (a failed propagation) and
 * is replaced by the other endpoint rather than poisoning the blend.
 */
export function blendInto(
    prev: Float32Array,
    next: Float32Array,
    current: Float32Array,
    blend: number,
    stride: number,
    angleOffsets: readonly number[]
): void {
    const angles = new Set(angleOffsets);
    for (let i = 0; i < current.length; i++) {
        const a = i < prev.length ? prev[i] : next[i];
        const b = i < next.length ? next[i] : a;
        if (!Number.isFinite(a)) current[i] = b;
        else if (!Number.isFinite(b)) current[i] = a;
        else if (angles.has(i % stride)) {
            const d = ((((b - a) % 360) + 540) % 360) - 180;
            current[i] = (((a + d * blend) % 360) + 360) % 360;
        } else {
            current[i] = a + (b - a) * blend;
        }
    }
}

type Listener = (message: WorkerResponse) => void;

// Position refresh scales with the propagated count: small filters stay snappy,
// while large catalogs slow the interval to leave the worker headroom. Budget
// ~100k propagated satellites/sec, clamped to a sane range.
const MIN_CADENCE_MS = 120;
const MAX_CADENCE_MS = 600;
const THROUGHPUT_PER_MS = 100;
const TICK_MS = 30;

/**
 * A single shared SGP4 worker, driven by this service. It propagates the catalog
 * on a count-scaled cadence, emitting ECF positions (globe) and the argument of
 * latitude (graph) from one pass — so no view propagates on the main thread and
 * the service is independent of any component's lifecycle. The worker lives for
 * the app's lifetime; components subscribe to its messages.
 */
class PropagationService {
    private worker: Worker | undefined;
    private readonly listeners = new Set<Listener>();
    private count = 0;
    /** Current snapshot cadence (wall ms); feeds the simclock advance math at call sites. */
    cadenceMs = MIN_CADENCE_MS;
    private timer: ReturnType<typeof setInterval> | undefined;
    private pending = false;
    private lastRequestWall = 0;
    private requestSeq = 0;
    /** Regime counter (see $lib/simclock for why epoch deltas alone can't serve views). */
    private revision = 0;
    /** Last seen `simScrubSeq`; a user scrub is a regime change that must snap, not blend. */
    private lastSeenScrubSeq = 0;

    private ensure(): Worker | undefined {
        if (typeof Worker === 'undefined') return undefined;
        if (!this.worker) {
            this.worker = new Worker(new URL('./workers/sgp4.worker.ts', import.meta.url), {
                type: 'module'
            });
            // Hook visibility only after a worker actually exists (constructor
            // can throw) so retries never stack listeners.
            document.addEventListener('visibilitychange', this.onVisibility);
            this.worker.onmessage = (event: MessageEvent<WorkerResponse>) =>
                this.handle(event.data);
            this.worker.onerror = (event) => {
                this.pending = false;
                this.emit({ type: 'error', message: event.message || 'Worker error' });
            };
        }
        return this.worker;
    }

    private handle(message: WorkerResponse): void {
        if (message.type === 'ready') {
            this.count = message.count ?? 0;
            this.cadenceMs = Math.min(
                MAX_CADENCE_MS,
                Math.max(MIN_CADENCE_MS, this.count / THROUGHPUT_PER_MS)
            );
            this.pending = false;
            this.lastRequestWall = 0;
            if (this.count > 0 && this.listeners.size > 0) this.startLoop();
            else this.stopLoop();
        } else if (message.type === 'positions' && message.positions && message.elements) {
            this.pending = false;
            // Anchor the cadence on receipt, not send: the next request fires
            // cadence.ms after the previous response LANDS, so stamps advance
            // at (real response interval)× speed and the worker stays single-
            // flight — no watchdog refire can upstage a still-outstanding
            // response (the watchdog below only covers a genuinely lost one).
            this.lastRequestWall = performance.now();
        }
        this.emit(message);
    }

    private emit(message: WorkerResponse): void {
        for (const listener of this.listeners) listener(message);
    }

    private readonly onVisibility = (): void => {
        if (document.hidden) this.stopLoop();
        else if (this.count > 0 && this.listeners.size > 0) this.startLoop();
    };

    private startLoop(): void {
        if (this.timer !== undefined) return;
        this.timer = setInterval(() => this.tick(), TICK_MS);
    }

    private stopLoop(): void {
        if (this.timer === undefined) return;
        clearInterval(this.timer);
        this.timer = undefined;
    }

    private tick(): void {
        const now = performance.now();
        if (this.pending && now - this.lastRequestWall > 3 * this.cadenceMs) {
            this.pending = false;
        }
        if (!this.pending && now - this.lastRequestWall >= this.cadenceMs) {
            this.lastRequestWall = now;
            this.pending = true;
            this.requestSeq++;
            if (trackerState.simScrubSeq !== this.lastSeenScrubSeq) {
                this.lastSeenScrubSeq = trackerState.simScrubSeq;
                this.revision++;
            }
            this.worker?.postMessage({
                type: 'propagate',
                epoch: nextPropagateEpoch(
                    trackerState.simEpochMs,
                    this.cadenceMs * trackerState.simSpeed
                ),
                requestId: this.requestSeq,
                revision: this.revision
            });
        }
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        // Wake the propagation loop back up for the first (re)subscriber.
        if (this.listeners.size === 1 && this.count > 0) this.startLoop();
        return () => {
            this.listeners.delete(listener);
            // No viewers — let the worker idle until someone listens again.
            if (this.listeners.size === 0) {
                this.pending = false;
                this.stopLoop();
            }
        };
    }

    init(satellites: ParsedSatellite[], scale: number, mode: ElementMode): void {
        this.revision++;
        this.ensure()?.postMessage({
            type: 'init',
            satellites: satellites.map(({ name, line1, line2 }) => ({ name, line1, line2 })),
            scale,
            mode
        });
    }

    /** Switch which orbital-element set the worker emits. */
    setMode(mode: ElementMode): void {
        this.revision++; // regime change: the next stamped response must snap
        this.ensure()?.postMessage({ type: 'mode', mode });
    }

    buildOrbits(epoch: number, requestId: number, frame: 'ecf' | 'eci'): void {
        this.ensure()?.postMessage({ type: 'buildOrbits', epoch, requestId, frame });
    }

    /** Nadir subpoint polyline for one satellite (worker index), one period into the future. */
    buildGroundTrack(epoch: number, requestId: number, index: number): void {
        this.ensure()?.postMessage({ type: 'buildGroundTrack', epoch, requestId, index });
    }
}

export const propagation = new PropagationService();
