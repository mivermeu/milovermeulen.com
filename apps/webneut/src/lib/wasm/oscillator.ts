import type { OscillationParameters } from '../webneut/types';

type WasmModule = {
    default: () => Promise<unknown>;
    oscillate: (json: string) => string;
};

let wasm: WasmModule | undefined;
let initPromise: Promise<void> | undefined;

export function initWasm(): Promise<void> {
    if (!initPromise) {
        initPromise = import('./pkg/oscillator_rs').then(async (m) => {
            await m.default();
            wasm = m as unknown as WasmModule;
        });
    }
    return initPromise;
}

export function oscillate(params: OscillationParameters): [number[], number[][]] {
    if (!wasm) throw new Error('WASM oscillator not initialized');
    return JSON.parse(wasm.oscillate(JSON.stringify(params))) as [number[], number[][]];
}
