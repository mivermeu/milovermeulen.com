import type { ParsedSatellite } from '$lib/satellites/types';
import { nextPropagateEpoch } from './simclock';
import { trackerState } from './state.svelte';
import type { ElementMode } from './orbit';
import type { ObserverLocation, PassRow } from './passes';

export type { ElementMode };

/** Pass search over the worker's currently loaded (tree-filtered) set. */
export interface PassesRequest {
    requestId: number;
    observer: ObserverLocation;
    startMs: number;
    endMs: number;
    minElDeg?: number;
    maxPasses?: number;
    /** When the active set is larger, only this many satellites (shortest period first) are searched. */
    maxSats?: number;
    /** Original-catalog index per satellite in last-`init` order, for result mapping. */
    originalIndices: number[];
}

/** Result cap bookkeeping surfaced as a "limited to N" note. */
export interface PassCapInfo {
    active: number;
    searched: number;
    capped: boolean;
}

export interface WorkerResponse {
    type: string;
    requestId?: number;
    count?: number;
    epoch?: number;
    /** Worker-side catalog version; bumped on every init so views can drop stale snapshots. */
    generation?: number;
    /** Data-regime version (init/mode switch); an older revision must snap, not blend. */
    revision?: number;
    colors?: Float32Array;
    positions?: Float32Array;
    elements?: Float32Array;
    message?: string;
    ranges?: number[];
    passes?: PassRow[];
    partial?: boolean;
    capInfo?: PassCapInfo;
    periodMs?: number;
    vertexTimes?: Float32Array;
    periods?: number[];
    vertexCounts?: number[];
    /** Flat SGP4-failure run layout per satellite: [nRuns, vertsRun1, …]. */
    runs?: Int32Array;
}

/** Blend `prev -> next` into `current`; angle channels wrap to the shortest arc, NaN yields to the other endpoint. */
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

// Position refresh scales with propagated count (~100k sats/sec), clamped to a sane range.
const MIN_CADENCE_MS = 120;
const MAX_CADENCE_MS = 600;
const THROUGHPUT_PER_MS = 100;
const TICK_MS = 30;

/** Shared SGP4 worker: propagates on a count-scaled cadence so no view works the main thread. Lives for the app lifetime. */
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
    /** Regime counter; a user scrub is a regime change that must snap, not blend. */
    private revision = 0;
    private lastSeenScrubSeq = 0;

    private ensure(): Worker | undefined {
        if (typeof Worker === 'undefined') return undefined;
        if (!this.worker) {
            this.worker = new Worker(new URL('./workers/sgp4.worker.ts', import.meta.url), {
                type: 'module'
            });
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
            // Anchor cadence on receipt so the worker stays single-flight; the watchdog only covers a lost response.
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
        if (this.listeners.size === 1 && this.count > 0) this.startLoop();
        return () => {
            this.listeners.delete(listener);
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
        this.revision++;
        this.ensure()?.postMessage({ type: 'mode', mode });
    }

    buildOrbits(
        epoch: number,
        requestId: number,
        frame: 'ecf' | 'eci',
        onlyIndex: number | null,
        cullMask: Uint8Array | null = null
    ): void {
        this.ensure()?.postMessage({
            type: 'buildOrbits',
            epoch,
            requestId,
            frame,
            onlyIndex,
            cullMask
        });
    }

    /** Nadir subpoint polyline for one satellite (worker index), one period into the future. */
    buildGroundTrack(epoch: number, requestId: number, index: number): void {
        this.ensure()?.postMessage({ type: 'buildGroundTrack', epoch, requestId, index });
    }

    /** Search passes over the worker's loaded catalog; results arrive as `type: 'passes'`. */
    findPasses(request: PassesRequest): void {
        this.ensure()?.postMessage({
            type: 'passes',
            ...request,
            // Snapshot the live `$state` proxy: structured-clone rejects proxies with DataCloneError.
            originalIndices: [...request.originalIndices]
        });
    }
}

export const propagation = new PropagationService();
