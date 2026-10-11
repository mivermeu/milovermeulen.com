import type { ParsedSatellite } from '$lib/satellites/types';

export type ElementMode = 'epoch' | 'smoothed' | 'instantaneous';

export interface WorkerResponse {
    type: string;
    requestId?: number;
    count?: number;
    epoch?: number;
    colors?: Float32Array;
    positions?: Float32Array;
    elements?: Float32Array;
    message?: string;
    ranges?: number[];
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
    private cadenceMs = MIN_CADENCE_MS;
    private timer: ReturnType<typeof setInterval> | undefined;
    private pending = false;
    private lastRequestWall = 0;
    private requestSeq = 0;

    private ensure(): Worker | undefined {
        if (typeof Worker === 'undefined') return undefined;
        if (!this.worker) {
            this.worker = new Worker(new URL('./workers/sgp4.worker.ts', import.meta.url), {
                type: 'module'
            });
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
            if (this.count > 0) this.startLoop();
            else this.stopLoop();
        } else if (message.type === 'positions' && message.positions && message.elements) {
            this.pending = false;
        }
        this.emit(message);
    }

    private emit(message: WorkerResponse): void {
        for (const listener of this.listeners) listener(message);
    }

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
            this.worker?.postMessage({
                type: 'propagate',
                epoch: Math.round(Date.now() + this.cadenceMs),
                requestId: this.requestSeq
            });
        }
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    init(satellites: ParsedSatellite[], scale: number, mode: ElementMode): void {
        this.ensure()?.postMessage({
            type: 'init',
            satellites: satellites.map(({ name, line1, line2 }) => ({ name, line1, line2 })),
            scale,
            mode
        });
    }

    /** Switch which orbital-element set the worker emits. */
    setMode(mode: ElementMode): void {
        this.ensure()?.postMessage({ type: 'mode', mode });
    }

    buildOrbits(epoch: number, requestId: number, frame: 'ecf' | 'eci'): void {
        this.ensure()?.postMessage({ type: 'buildOrbits', epoch, requestId, frame });
    }
}

export const propagation = new PropagationService();
