import type { ParsedSatellite } from '$lib/satellites/types';

export interface WorkerResponse {
    type: string;
    requestId?: number;
    count?: number;
    epoch?: number;
    colors?: Float32Array;
    positions?: Float32Array;
    u?: Float32Array;
    message?: string;
    ranges?: number[];
}

export interface PropagationSnapshot {
    epoch: number;
    count: number;
    positions: Float32Array;
    u: Float32Array;
}

type Listener = (message: WorkerResponse) => void;

/**
 * A single shared SGP4 worker. Both the globe (positions) and the graph (argument
 * of latitude) consume it, so the catalog is propagated once per tick, off the main
 * thread, instead of separately in each view. The worker lives for the app's
 * lifetime; components subscribe to its messages.
 */
class PropagationService {
    private worker: Worker | undefined;
    private readonly listeners = new Set<Listener>();
    private snapshot: PropagationSnapshot | null = null;

    private ensure(): Worker | undefined {
        if (typeof Worker === 'undefined') return undefined;
        if (!this.worker) {
            this.worker = new Worker(new URL('./workers/sgp4.worker.ts', import.meta.url), {
                type: 'module'
            });
            this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                const message = event.data;
                if (message.type === 'positions' && message.positions && message.u) {
                    this.snapshot = {
                        epoch: message.epoch ?? Date.now(),
                        count: message.count ?? message.positions.length / 3,
                        positions: message.positions,
                        u: message.u
                    };
                }
                for (const listener of this.listeners) listener(message);
            };
            this.worker.onerror = (event) => {
                const message: WorkerResponse = {
                    type: 'error',
                    message: event.message || 'Worker error'
                };
                for (const listener of this.listeners) listener(message);
            };
        }
        return this.worker;
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    init(satellites: ParsedSatellite[], scale: number): void {
        this.ensure()?.postMessage({
            type: 'init',
            satellites: satellites.map(({ name, line1, line2 }) => ({ name, line1, line2 })),
            scale
        });
    }

    propagate(epoch: number, requestId: number): void {
        this.ensure()?.postMessage({ type: 'propagate', epoch, requestId });
    }

    buildOrbits(epoch: number, requestId: number, frame: 'ecf' | 'eci'): void {
        this.ensure()?.postMessage({ type: 'buildOrbits', epoch, requestId, frame });
    }

    /** Latest propagated snapshot (positions + argument of latitude), or null. */
    latest(): PropagationSnapshot | null {
        return this.snapshot;
    }
}

export const propagation = new PropagationService();
